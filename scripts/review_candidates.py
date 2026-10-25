from __future__ import annotations
import argparse,collections,json,pathlib
from harvest_graduates import namekey,title_support,blocks_for_number
p=argparse.ArgumentParser();p.add_argument('--root',required=True);a=p.parse_args();root=pathlib.Path(a.root).resolve()
q=json.loads((root/'output/review-queue.json').read_text());print(json.dumps({'pendingKinds':dict(collections.Counter(x['kind'] for x in q['items'])),'issueKinds':dict(collections.Counter(x['kind'] for x in q['issues']))},ensure_ascii=False))
students=json.loads((root/'output/students-master.json').read_text())['students'];theses=json.loads((root/'output/theses-master.json').read_text())['theses'];by_name={(namekey(s['fullName']),s['degree'],s['program']):s for s in students};out=[]
for t in theses:
 s=by_name.get((namekey(t['studentName']),t['degree'],t['program']))
 if not s:continue
 for path in (root/'council-text').glob('*.json'):
  if path.name=='index.json':continue
  doc=json.loads(path.read_text())
  for pg in doc['pages']:
   method='text';ocr=root/'council-ocr'/(doc['source']['blob']+f"-{pg['page']}.json")
   if not pg['textUsable'] and ocr.exists():pg=json.loads(ocr.read_text());method='ocr'
   if not pg['textUsable']:continue
   if s['studentNumber'] not in pg['text']:continue
   blocks=blocks_for_number(pg['text'],s['studentNumber']);support=[title_support(t['title'],b) for b in blocks]
   out.append({'studentName':s['fullName'],'number':s['studentNumber'],'studentKey':s['studentNumber']+'|'+s['program']+'|'+s['degree'],'thesisId':t['id'],'title':t['title'],'path':doc['source']['path'],'source':doc['source'],'page':pg['page'],'method':method,'bestCoverage':max((x.get('coverage',0) for x in support),default=0),'supports':support,'blocks':blocks})
out.sort(key=lambda x:x['bestCoverage'],reverse=True);(root/'title-corroboration-candidates.json').write_text(json.dumps(out,ensure_ascii=False,indent=2));print(json.dumps({'candidates':len(out),'byMethod':dict(collections.Counter(x['method'] for x in out))},ensure_ascii=False,indent=2))
