"""Read local Oracle census exports into private, page/row-addressed observations.

Does not mutate source files, the application, or the browser's saved workspace.
Filename periods are recorded as filename-derived context, never admission cohorts.
"""
from __future__ import annotations
import argparse, collections, datetime as dt, hashlib, html, io, json, pathlib, re, sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from harvest_graduates import degree, program, key, norm, namekey

ALIASES = {
 'الرقم الجامعي':'studentNumber','الاسم':'fullName','اسم الطالب':'fullName',
 'التخصص':'program','الدرجة العلمية':'degree','الحالة':'status','الجنس':'gender',
 'الجنسية':'nationality','تاريخ القبول':'admissionDate','تاريخ التخرج':'graduationDate',
 'تاريخ المتوقع تخرجه':'expectedGraduationRaw','المعدل':'gpaRaw',
}
REQUIRED = {'studentNumber','fullName','program','degree','status'}

def clean(value):
 if isinstance(value,(dt.datetime,dt.date)):return value.isoformat()[:10]
 return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]*>',' ',str('' if value is None else value)))).strip()

def parse(data, filename):
 """Return original fields and locators, excluding non-census workbook structures."""
 created='';groups=[]
 if data.startswith(b'PK'):
  import openpyxl
  book=openpyxl.load_workbook(io.BytesIO(data),read_only=True,data_only=True)
  groups=[(sheet.title,[(i,[clean(v) for v in row]) for i,row in enumerate(sheet.iter_rows(values_only=True),1)]) for sheet in book]
 elif data[:8]==b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
  import xlrd
  book=xlrd.open_workbook(file_contents=data)
  groups=[(sheet.name,[(i+1,[clean(sheet.cell_value(i,j)) for j in range(sheet.ncols)]) for i in range(sheet.nrows)]) for sheet in book.sheets()]
 else:
  text=data.decode('cp1256');match=re.search(r'<o:Created>(\d{4}-\d{2}-\d{2})[^<]*</o:Created>',text,re.I)
  if match:created=match.group(1)
  groups=[('HTML',[(i,[clean(v) for v in re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>',tr,re.I|re.S)]) for i,tr in enumerate(re.findall(r'<tr[^>]*>(.*?)</tr>',text,re.I|re.S),1)])]
 records=[];all_count=0;has_header=False;headers_seen=set()
 for sheet,rows in groups:
  mapping={};headers=[];department=''
  for index,cells in rows:
   heading=' '.join(cells)
   dept=re.search(r'القسم\s*:\s*([^:]+)',heading)
   if dept:department=dept.group(1).strip()
   proposed={ALIASES[v]:j for j,v in enumerate(cells) if v in ALIASES}
   if REQUIRED <= proposed.keys():
    mapping=proposed;headers=cells;has_header=True;headers_seen.add(tuple(cells));continue
   if not mapping:continue
   get=lambda field:cells[mapping[field]] if field in mapping and mapping[field]<len(cells) else ''
   number=norm(get('studentNumber')).removesuffix('.0')
   if not re.fullmatch(r'\d{7,9}',number):continue
   all_count+=1;deg=degree(get('degree'))
   if not deg:continue
   record={field:get(field) for field in ALIASES.values()};record.update(studentNumber=number,degree=deg,program=program(get('program'),deg),department=department,locator=f'{sheet} row {index}',raw=dict(zip(headers,cells)))
   records.append(record)
 return {'createdInSource':created,'hasCensusHeader':has_header,'allStudentRows':all_count,'postgraduateRows':len(records),'headers':[list(x) for x in headers_seen],'records':records}

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--inventory',required=True,type=pathlib.Path);ap.add_argument('--output',required=True,type=pathlib.Path);ap.add_argument('--baseline',type=pathlib.Path);ap.add_argument('--python-deps',type=pathlib.Path);args=ap.parse_args()
 if args.python_deps:sys.path.insert(0,str(args.python_deps))
 root=args.output.resolve();root.mkdir(parents=True,exist_ok=True)
 inventory=json.loads(args.inventory.read_text());paths=inventory.get('allSpreadsheetPaths',inventory.get('paths',[]))
 selected=[]
 for value in paths:
  path=pathlib.Path(value);stem=norm(path.stem)
  if path.suffix.lower() not in ['.xls','.xlsx'] or '/مهام الدراسات العليا/' in value:continue
  native=bool(re.fullmatch(r'(?:3[5-9]|4[0-8])[1-5]',stem))
  oracle=stem.startswith('getjobid') and any(v in unicodedata.normalize('NFKC',value) for v in ['بيانات','ملفات البريد','Downloads'])
  if native or oracle:selected.append(path)
 groups=collections.defaultdict(list);errors=[]
 def digest(path):
  data=path.read_bytes();return path,hashlib.sha256(data).hexdigest(),len(data)
 with ThreadPoolExecutor(max_workers=4) as pool:
  for path,sha,size in pool.map(digest,selected):groups[sha].append({'path':str(path),'bytes':size,'filenamePeriod':norm(path.stem) if re.fullmatch(r'(?:3[5-9]|4[0-8])[1-5]',norm(path.stem)) else ''})
 manifest=[];observations=[];profiles=[];conflicts=[]
 for sha,aliases in groups.items():
  original=pathlib.Path(aliases[0]['path']);data=original.read_bytes()
  try:result=parse(data,original.name)
  except Exception as e:errors.append({'path':str(original),'error':str(e)});continue
  periods=sorted({x['filenamePeriod'] for x in aliases if x['filenamePeriod']});period=periods[0] if len(periods)==1 else ''
  profile={k:v for k,v in result.items() if k not in ['records','headers']};profile.update(sha256=sha,aliases=aliases,filenamePeriodCandidates=periods)
  profiles.append(profile)
  if not result['hasCensusHeader']:continue
  local=root/'sources'/sha/original.name;local.parent.mkdir(parents=True,exist_ok=True);local.write_bytes(data)
  source={'id':'local-census:'+sha,'sha256':sha,'localPath':str(local),'originalPaths':aliases,'sourceDate':result['createdInSource'],'period':period,'periodBasis':'filename' if period else 'unresolved'};manifest.append(source)
  if len(periods)>1:conflicts.append({'kind':'same_content_multiple_period_filenames','sourceId':source['id'],'periods':periods})
  for record in result['records']:observations.append({**record,'sourceId':source['id'],'sourceDate':source['sourceDate'],'period':period,'academicYear':str(1400+int(period[:2])) if period else '', 'semester':period[-1] if period else ''})
  if len(manifest)%10==0:print(json.dumps({'parsedCensusSources':len(manifest),'postgraduateObservations':len(observations)}),flush=True)
 baseline=json.loads(args.baseline.read_text())['students'] if args.baseline else []
 existing={key(s['studentNumber'],s['program'],s['degree']):s for s in baseline}
 current=[r for r in observations if r['period']=='481'];current_by={key(r['studentNumber'],r['program'],r['degree']):r for r in current}
 current_conflicts=[{'studentKey':k,'documentName':r['fullName'],'previousName':existing[k]['fullName']} for k,r in current_by.items() if k in existing and namekey(r['fullName'])!=namekey(existing[k]['fullName'])]
 summary={'scannedPaths':len(selected),'uniqueFileContents':len(groups),'censusSources':len(manifest),'postgraduateObservations':len(observations),'uniqueEnrollmentKeys':len({key(r['studentNumber'],r['program'],r['degree']) for r in observations}),'sourcePeriods':sorted({r['period'] for r in observations if r['period']}),'currentYear1448':{'sourcePeriod':'481','observations':len(current),'uniqueEnrollments':len(current_by),'regular':sum(r['status']=='منتظم' for r in current_by.values()),'regularByDegree':dict(collections.Counter(r['degree'] for r in current_by.values() if r['status']=='منتظم')),'statusCounts':dict(collections.Counter(r['status'] for r in current_by.values())),'byProgramDegree':dict(collections.Counter(r['degree']+' '+r['program'] for r in current_by.values())),'alreadyInPriorCollection':sum(k in existing for k in current_by),'notInPriorCollection':sum(k not in existing for k in current_by),'nameDifferencesWithinSameKey':len(current_conflicts)},'parseErrors':len(errors),'ambiguousPeriodFiles':len(conflicts)}
 outputs={'census-source-manifest.json':{'sources':manifest,'profiles':profiles,'errors':errors,'periodConflicts':conflicts},'census-observations.json':{'observations':observations},'current-1448-records.json':{'students':list(current_by.values()),'nameDifferences':current_conflicts},'local-census-summary.json':summary}
 for filename,value in outputs.items():(root/filename).write_text(json.dumps(value,ensure_ascii=False,indent=2))
 print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
