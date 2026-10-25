"""Download and verify council PDFs from the pinned, authorized repository."""
from __future__ import annotations
import argparse, base64, concurrent.futures as cf, hashlib, json, pathlib, subprocess, urllib.parse

def main():
 p=argparse.ArgumentParser();p.add_argument('--sources',required=True);p.add_argument('--sample',action='store_true');a=p.parse_args();root=pathlib.Path(a.sources).resolve()
 source_manifest=json.loads((root/'source-manifest.json').read_text());commit=source_manifest['repositories']['IndexForMeeting']['commit']
 tree=json.loads((root/'metadata/IndexForMeeting-tree.json').read_text())
 blobs=[x for x in tree['tree'] if x['type']=='blob' and x['path'].startswith('pdfs/') and x['path'].endswith('.pdf')]
 if a.sample:blobs=[x for x in blobs if x['path'] in ['pdfs/4604-03.pdf','pdfs/sharia/4704-03.pdf','pdfs/culture/4704-02.pdf']]
 print(json.dumps({'files':len(blobs),'MB':round(sum(x['size'] for x in blobs)/1e6,1)}),flush=True)
 def fetch(x):
  path=x['path'];local=root/'github/IndexForMeeting'/path;local.parent.mkdir(parents=True,exist_ok=True)
  if not local.exists():
   endpoint=f'repos/majed354/IndexForMeeting/git/blobs/{x["sha"]}'
   payload=json.loads(subprocess.check_output(['gh','api',endpoint,'-H','Accept: application/vnd.github+json']))
   data=base64.b64decode(payload['content'])
  else:data=local.read_bytes()
  digest=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
  if digest!=x['sha']:raise ValueError('PDF blob mismatch: '+path)
  if not local.exists():local.write_bytes(data)
  return {'id':'IndexForMeeting:'+path+':'+digest,'repository':'IndexForMeeting','path':path,'commit':commit,'blob':digest,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'localPath':str(local),'url':f'https://github.com/majed354/IndexForMeeting/blob/{commit}/{urllib.parse.quote(path,safe="/")}'}
 results=[]
 with cf.ThreadPoolExecutor(max_workers=4) as pool:
  for future in cf.as_completed([pool.submit(fetch,x) for x in blobs]):
   results.append(future.result())
   if len(results)%15==0:print(json.dumps({'downloaded':len(results),'total':len(blobs)}),flush=True)
 dest=root/('council-sample-manifest.json' if a.sample else 'council-pdf-manifest.json')
 dest.write_text(json.dumps({'commit':commit,'sources':sorted(results,key=lambda x:x['path'])},ensure_ascii=False,indent=2))
 print(json.dumps({'verified':len(results)}),flush=True)

if __name__=='__main__':main()
