"""OCR weak pages of councils with graduate topics; preserve page provenance and confidence."""
from __future__ import annotations
import argparse, concurrent.futures as cf, csv, json, pathlib, re, subprocess, tempfile
from index_councils import normalize_text

def main():
 p=argparse.ArgumentParser();p.add_argument('--sources',required=True);p.add_argument('--workers',type=int,default=4);a=p.parse_args();root=pathlib.Path(a.sources).resolve();textdir=root.parent/'council-text';out=root.parent/'council-ocr';out.mkdir(exist_ok=True)
 rows=list(csv.DictReader((root/'github/IndexForMeeting/data/councils.csv').open(encoding='utf-8-sig'),delimiter=';'));selected=set()
 for r in rows:
  if any(w in ' '.join(r.values()) for w in ['رسالة','رسال','خطط بحث','مشرف','مناقش','دراسات عليا','ماجستير','دكتوراه']):
   selected.add(r['مسار PDF'] or 'pdfs/'+r['السنة الهجرية'][-2:]+r['الشهر الهجري'].zfill(2)+'-'+r['رقم المجلس'].zfill(2)+'.pdf')
 jobs=[]
 for path in textdir.glob('*.json'):
  if path.name=='index.json':continue
  d=json.loads(path.read_text())
  if d['source']['path'] in selected:
   for page in d['pages']:
    if not page['textUsable']:jobs.append((d['source'],page['page']))
 print(json.dumps({'documents':len(selected),'weakPagesSelected':len(jobs)}),flush=True)
 def process(job):
  source,page=job;dest=out/(source['blob']+f'-{page}.json')
  if dest.exists():return json.loads(dest.read_text())
  with tempfile.TemporaryDirectory(prefix='grad-ocr-') as tmp:
   base=pathlib.Path(tmp)/'page';subprocess.run(['pdftoppm','-f',str(page),'-l',str(page),'-r','180','-singlefile','-png',source['localPath'],str(base)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=90)
   subprocess.run(['tesseract',str(base)+'.png',str(base),'-l','ara+eng','--psm','3','txt','tsv'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=120)
   text=normalize_text(base.with_suffix('.txt').read_text());tsv=list(csv.DictReader(base.with_suffix('.tsv').open(),delimiter='\t'));conf=[float(r['conf']) for r in tsv if float(r['conf'])>=0 and r['text'].strip()];mean=sum(conf)/max(len(conf),1)
   arabic=len(re.findall(r'[\u0621-\u064a]',text));letters=len(re.findall(r'[A-Za-z\u0621-\u064a]',text));ratio=arabic/max(letters,1)
   result={'sourceId':source['id'],'path':source['path'],'page':page,'method':'tesseract-ara-eng-180dpi','meanWordConfidence':round(mean,2),'text':text,'textUsable':arabic>=80 and ratio>=.4}
   dest.write_text(json.dumps(result,ensure_ascii=False,indent=2));return result
 results=[];errors=[]
 with cf.ThreadPoolExecutor(max_workers=a.workers) as pool:
  futures={pool.submit(process,j):j for j in jobs}
  for f in cf.as_completed(futures):
   try:results.append(f.result())
   except Exception as e:errors.append({'path':futures[f][0]['path'],'page':futures[f][1],'error':str(e)})
   if (len(results)+len(errors))%25==0:print(json.dumps({'processed':len(results),'failed':len(errors),'total':len(jobs)}),flush=True)
 summary={'selectedDocuments':len(selected),'selectedPages':len(jobs),'completed':len(results),'usablePages':sum(x['textUsable'] for x in results),'errors':errors};(out/'index.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
