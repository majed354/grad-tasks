"""Merge a private source collection into a backed-up workspace, preserving IDs.

Local census observations are snapshots, not extra students. Number/name conflicts
and contradictory thesis titles are quarantined. No source or browser is mutated.
"""
from __future__ import annotations
import argparse, collections, copy, datetime as dt, difflib, json, pathlib, re
from harvest_graduates import uid, key, norm, namekey, compatible_name, student_base, valid_date, number_value, STATUS, title_support, degree, program

def same_person(a,b):
 return namekey(a).replace('ة','ه')==namekey(b).replace('ة','ه') or compatible_name(a,b) or compatible_name(b,a)

def same_title(a,b):
 from harvest_graduates import compact
 if compact(a)==compact(b):return True
 # Different verse/volume ranges must not collapse just because the book title agrees.
 if re.findall(r'\d+',norm(a))!=re.findall(r'\d+',norm(b)):return False
 return difflib.SequenceMatcher(None,compact(a),compact(b)).ratio()>=.90 and (title_support(a,b)['supported'] or title_support(b,a)['supported'])

def local_evidence(source,locator,fields,now,kind,raw_date='',calendar='غير محدد',notes=''):
 return {'id':uid(source['id']+':'+locator+':'+kind),'sourceId':source['id'],'kind':kind,'url':'','locator':locator,'observedAt':now,'fields':fields,'rawDate':raw_date,'calendar':calendar,'notes':notes,'sourceName':pathlib.Path(source['localPath']).name,'sourcePath':str(pathlib.Path(source['localPath']).resolve())}

def add_evidence(student,ev):
 if not any(e['id']==ev['id'] for e in student['evidence']):student['evidence'].append(ev)

def research_record(t,student):
 fields=['id','title','degree','program','year','status','defenseDateRaw','defenseCalendar','supervisorId','supervisor','coSupervisorId','coSupervisor','examiner1Id','examiner1','examiner2Id','examiner2']
 r={k:str(t.get(k,'') or '') for k in fields};r.update(degree=student['degree'],program=student['program'],verification='موثق',evidenceIds=[],notes='')
 return r

def merge(baseline,local,harvest,now):
 workspace=copy.deepcopy(baseline);students={key(s['studentNumber'],s['program'],s['degree']):s for s in workspace['students']};issues=[];sources={s['id']:s for s in json.loads((local/'census-source-manifest.json').read_text())['sources']};observations=json.loads((local/'census-observations.json').read_text())['observations'];groups=collections.defaultdict(list)
 for r in observations:groups[key(r['studentNumber'],r['program'],r['degree'])].append(r)
 previous_ids={k:s['id'] for k,s in students.items()}
 for identity,rows in groups.items():
  latest=max(rows,key=lambda r:(r['period'],r['sourceDate']));s=students.get(identity)
  if not s:s=student_base(latest['studentNumber'],latest['fullName'],latest['program'],latest['degree'],now);students[identity]=s
  s.setdefault('academicSnapshots',[]);s.setdefault('asOfPeriod','');snapgroups=collections.defaultdict(list)
  for r in rows:
   if not same_person(r['fullName'],s['fullName']):issues.append({'kind':'census_number_name_conflict','studentKey':identity,'observation':r});continue
   if not r['period']:issues.append({'kind':'census_period_unknown','studentKey':identity,'observation':r});continue
   snapgroups[(r['period'],r['sourceDate'])].append(r)
  for (period,asof),rr in sorted(snapgroups.items()):
   r=rr[0];eids=[]
   for raw in rr:
    ev=local_evidence(sources[raw['sourceId']],raw['locator'],['status','gpa','admissionDate','graduationDate','gender','nationality','department'],now,'كشف فصل دراسي',asof,'ميلادي' if asof else 'غير محدد','الفصل '+period+' وسنته من ترميز اسم الكشف؛ تاريخ الاستخراج مستقل عن سنة الحالة.');add_evidence(s,ev);eids.append(ev['id'])
   statuses={STATUS.get(x['status'],'غير موثق') for x in rr};status=next(iter(statuses)) if len(statuses)==1 else 'غير موثق';gpas={number_value(x.get('gpaRaw')) for x in rr if x.get('gpaRaw')!=''}
   if len(statuses)>1 or len(gpas)>1:issues.append({'kind':'same_snapshot_field_conflict','studentKey':identity,'period':period,'sourceDate':asof,'statuses':sorted(statuses),'gpas':list(gpas)})
   snapshot={'id':uid('snapshot:'+identity+':'+period+':'+asof),'academicYear':r['academicYear'],'period':period,'semester':r['semester'],'sourceDate':asof,'status':status,'stage':'متخرج' if status=='متخرج' else 'غير موثق','department':r.get('department') or s['department'],'gender':r.get('gender') if r.get('gender') in ['ذكر','أنثى'] else 'غير محدد','nationality':r.get('nationality',''),'gpa':next(iter(gpas)) if len(gpas)==1 else None,'gpaScale':None,'admissionDateRaw':r.get('admissionDate',''),'graduationDateRaw':r.get('graduationDate',''),'expectedGraduationRaw':r.get('expectedGraduationRaw',''),'evidenceIds':sorted(set(eids)),'notes':'رصد تاريخي من الكشف؛ التخرج المتوقع لا يثبت التخرج.'}
   old=next((x for x in s['academicSnapshots'] if x['period']==period and x['sourceDate']==asof),None)
   if old:s['academicSnapshots'].remove(old)
   s['academicSnapshots'].append(snapshot)
  if s['academicSnapshots']:
   last=max(s['academicSnapshots'],key=lambda x:(x['period'],x['sourceDate']));s.update(status=last['status'],stage=last['stage'],department=last['department'],gender=last['gender'],nationality=last['nationality'],gpa=last['gpa'],gpaScale=None,asOfAcademicYear=last['academicYear'],asOfPeriod=last['period'],sourceDate=last['sourceDate'],source='كشف الفصل '+last['period']+' — آخر رصد '+last['academicYear'])
   for field,raw in [('admissionDate','admissionDateRaw'),('graduationDate','graduationDateRaw')]:
    value=valid_date(last[raw])
    if value:s[field]=value
   note='جُمعت كشوف الفصول والسنوات في سجل الرصد؛ الحالة الأساسية آخر رصد مصدر متاح وليست استنتاجًا من الغياب.'
   if note not in s['notes']:s['notes']=(s['notes']+'\n' if s['notes'] else '')+note
   s['updatedAt']=now

 # Local thesis relationships require the academic number plus a corroborated name.
 source_list=json.loads((local/'research-source-manifest.json').read_text())['sources'];rsources={s['id']:s for s in source_list};catalog=json.loads((harvest/'output/theses-master.json').read_text())['theses'];bystudent=collections.defaultdict(list);by_number=collections.defaultdict(list)
 for identity,s in students.items():by_number[s['studentNumber']].append((identity,s))
 # Re-evaluate ALL numbered source rows against the expanded roster, including new enrollments.
 # The earlier search proposals were based on the smaller, previous workspace.
 research_path=local/'research-observations.json'
 if research_path.exists():research_rows=json.loads(research_path.read_text())['observations']
 else:research_rows=[]
 for raw in research_rows:
  number=norm(raw.get('studentNumber','')).removesuffix('.0')
  if not number:continue
  deg=degree(raw.get('degree'));candidates=[(identity,s) for identity,s in by_number.get(number,[]) if (not deg or s['degree']==deg) and (not raw.get('program') or norm(program(raw['program'],s['degree']))==norm(s['program']))]
  matches=[(identity,s) for identity,s in candidates if same_person(raw['studentName'],s['fullName'])]
  if len(matches)==1:
   identity,s=matches[0];bystudent[identity].append({'studentKey':identity,'studentId':s['id'],'title':raw['title'],'supervisor':raw.get('supervisor',''),'sourceId':raw['sourceId'],'locator':raw['locator'],'degreeBasis':'صريحة في المصدر' if deg else 'من قيد موثق بالرقم والاسم والبرنامج','raw':raw})
  elif candidates:issues.append({'kind':'number_name_conflict_or_ambiguity','source':raw})
 for identity,claims in bystudent.items():
  s=students.get(identity)
  if not s:issues.append({'kind':'thesis_missing_enrollment','studentKey':identity});continue
  title_groups=[]
  for claim in claims:
   group=next((g for g in title_groups if same_title(g[0]['title'],claim['title'])),None)
   if group is None:title_groups.append([claim])
   else:group.append(claim)
  ambiguous=len(title_groups)>1
  if ambiguous:issues.append({'kind':'multiple_local_thesis_titles','studentKey':identity,'claims':claims})
  for group in title_groups:
   claim=group[0];title=claim['title'];existing=next((t for t in s['researchRecords'] if same_title(t['title'],title)),None)
   candidates=[t for t in catalog if t['degree']==s['degree'] and t['program']==s['program'] and same_person(t['studentName'],s['fullName']) and same_title(t['title'],title)]
   if not existing and len(candidates)==1:
    t=candidates[0];existing=research_record(t,s)
    for e in t['evidence']:add_evidence(s,e);existing['evidenceIds'].append(e['id'])
   if not existing:
    existing=research_record({'id':uid('local-thesis:'+identity+':'+norm(title)),'title':title,'defenseCalendar':'غير محدد'},s)
   if ambiguous:existing['verification']='للمراجعة';existing['notes']='توجد عناوين مختلفة في سجل محلي غير مؤرخ؛ لا يعتمد أحدها عنوانًا رئيسًا قبل حسم اختلاف النسخ.'
   elif not existing.get('year'):existing['notes']='ربط بالرقم الجامعي والاسم وقرائن البرنامج؛ تاريخ هذا السجل المحلي غير مثبت، ولا يثبت الإشراف الحالي.'
   for raw in group:
    ev=local_evidence(rsources[raw['sourceId']],raw['locator'],['studentNumber','studentName','title','supervisor'],now,'دليل رسائل محلي',notes='الربط بالرقم الجامعي وقرائن الاسم؛ الدرجة: '+raw['degreeBasis']+'؛ العنوان كما ورد: '+raw['title']+'؛ المشرف كما ورد: '+raw.get('supervisor','غير مسجل'));add_evidence(s,ev);existing['evidenceIds'].append(ev['id'])
    if raw.get('supervisor') and not existing['supervisor']:existing['supervisor']=raw['supervisor'];existing['supervisorId']=''
   existing['evidenceIds']=list(dict.fromkeys(existing['evidenceIds']))
   if not any(t['id']==existing['id'] for t in s['researchRecords']):s['researchRecords'].append(existing)
  verified=[t for t in s['researchRecords'] if t['verification']=='موثق']
  if not ambiguous and verified:
   # A dated, previously verified statement takes precedence over an undated local version.
   primary=max(verified,key=lambda t:int(t['year']) if str(t['year']).isdigit() else 0)
   if not s['thesisTitle']:s['thesisTitle']=primary['title']
   if not s['supervisor']:s['supervisor']=primary['supervisor']
   if not s['coSupervisor']:s['coSupervisor']=primary['coSupervisor']

 contacts=json.loads((local/'contact-observations.json').read_text());csources={s['id']:s for s in contacts['sources']}
 for c in contacts['matchedProposals']:
  s=students.get(c['studentKey'])
  if not s or not same_person(c['fullName'],s['fullName']):issues.append({'kind':'contact_identity_conflict','proposal':c});continue
  ev=local_evidence(csources[c['sourceId']],c['locator'],['phone','email'],now,'قائمة اتصال تاريخية',notes='رقم جامعي واسم كامل وبرنامج ودرجة صريحة في الملاحظة؛ لا تثبت القائمة الحالة الأكاديمية الحالية ولا فعالية وسائل الاتصال.');add_evidence(s,ev)
  for field in ['phone','email']:
   if not s[field]:s[field]=c[field]
   elif s[field]!=c[field]:issues.append({'kind':'contact_value_conflict','studentKey':c['studentKey'],'field':field,'incoming':c[field],'existing':s[field]})
 for s in students.values():
  s['evidence']=list({e['id']:e for e in s['evidence']}.values());s['academicSnapshots'].sort(key=lambda x:(x['period'],x['sourceDate']),reverse=True)
  assert previous_ids.get(key(s['studentNumber'],s['program'],s['degree']),s['id'])==s['id']
 workspace['students']=list(students.values());workspace['revision']=0
 return workspace,issues

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--baseline',required=True,type=pathlib.Path);ap.add_argument('--local',required=True,type=pathlib.Path);ap.add_argument('--harvest',required=True,type=pathlib.Path);ap.add_argument('--output',required=True,type=pathlib.Path);a=ap.parse_args();now=dt.datetime.now(dt.timezone.utc).isoformat();base=json.loads(a.baseline.read_text());workspace,issues=merge(base,a.local,a.harvest,now);a.output.mkdir(parents=True,exist_ok=True);students=workspace['students'];current=[s for s in students if any(x['period']=='481' and x['sourceDate']=='2026-10-07' for x in s['academicSnapshots'])]
 summary={'students':len(students),'snapshots':sum(len(s['academicSnapshots']) for s in students),'sourceEvidence':sum(len(s['evidence']) for s in students),'studentsWithVerifiedTheses':sum(any(t['verification']=='موثق' for t in s['researchRecords']) for s in students),'studentsWithResearchUnderReview':sum(any(t['verification']=='للمراجعة' for t in s['researchRecords']) for s in students),'studentsWithSupervisor':sum(bool(s['supervisor']) for s in students),'studentsWithPhoneAndEmail':sum(bool(s['phone'] and s['email']) for s in students),'currentYearEnrollments':len(current),'issues':dict(collections.Counter(x.get('kind','unknown') for x in issues))}
 payload={'format':'grad-tasks-backup','exportedAt':now,**workspace};file=a.output/'merged-students.grad.json';file.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')));summary['importBytes']=file.stat().st_size
 (a.output/'integration-review.json').write_text(json.dumps({'issues':issues},ensure_ascii=False,indent=2));(a.output/'integration-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
