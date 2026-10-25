"""Extract page-addressable text; retain the PDF and mark weak OCR instead of guessing."""
from __future__ import annotations
import argparse, concurrent.futures as cf, json, pathlib, re, subprocess, unicodedata

def normalize_text(s):
 s=unicodedata.normalize('NFKC',s)
 s=re.sub(r'[\u200e\u200f\u202a-\u202e\u2066-\u2069]','',s)
 s=s.translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'))
 return s

def main():
 p=argparse.ArgumentParser();p.add_argument('--sources',required=True);a=p.parse_args();root=pathlib.Path(a.sources).resolve();manifest=json.loads((root/'council-pdf-manifest.json').read_text());out=root.parent/'council-text';out.mkdir(exist_ok=True)
 def process(source):
  local=out/(source['blob']+'.json')
  if local.exists():return json.loads(local.read_text())
  text=subprocess.check_output(['pdftotext','-layout',source['localPath'],'-'],stderr=subprocess.DEVNULL).decode('utf-8');parts=text.split('\f');
  if not parts[-1].strip():parts.pop()
  pages=[]
  for n,raw in enumerate(parts,1):
   clean=normalize_text(raw);arabic=len(re.findall(r'[\u0621-\u064a]',clean));letters=len(re.findall(r'[A-Za-z\u0621-\u064a]',clean));ratio=arabic/max(letters,1)
   pages.append({'page':n,'text':clean,'arabicChars':arabic,'arabicRatio':round(ratio,3),'textUsable':arabic>=80 and ratio>=0.40})
  result={'sourceId':source['id'],'source':source,'pages':pages};local.write_text(json.dumps(result,ensure_ascii=False,indent=2));return result
 with cf.ThreadPoolExecutor(max_workers=4) as pool:items=list(pool.map(process,manifest['sources']))
 summary={'documents':len(items),'pages':sum(len(x['pages']) for x in items),'usablePages':sum(p['textUsable'] for x in items for p in x['pages']),'weakPages':sum(not p['textUsable'] for x in items for p in x['pages'])}
 (out/'index.json').write_text(json.dumps({'summary':summary,'files':[{'sourceId':x['sourceId'],'blob':x['source']['blob'],'pages':len(x['pages'])} for x in items]},ensure_ascii=False,indent=2));print(json.dumps(summary),flush=True)

if __name__=='__main__':main()
