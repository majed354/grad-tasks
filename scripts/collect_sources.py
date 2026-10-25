"""Read pinned GitHub data into ignored private storage. Never prints student rows."""
from __future__ import annotations
import argparse, datetime as dt, hashlib, json, pathlib, subprocess, urllib.parse

SELECTIONS = {
    'KPI_TaifShare3h': ['data/students_detail.csv','data/graduates_detail.csv','data/non_completers.csv','data/programs.json','COLUMNS_GUIDE.md'],
    'faculty-activities': ['data/theses.csv','data/faculty.csv','data/config.json'],
    'IndexForMeeting': ['data/councils.csv'],
    'courseOfShar3ah': ['data.json'],
    'self_study': ['data/evidence-inventory-pg.json'],
    'Shari3ahSurveys': ['data/kpi/program-experience.json'],
}

def gh_json(endpoint):
    return json.loads(subprocess.check_output(['gh','api',endpoint]))

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',required=True);args=parser.parse_args()
    root=pathlib.Path(args.output).resolve();root.mkdir(parents=True,exist_ok=True)
    manifest={'collectedAt':dt.datetime.now(dt.timezone.utc).isoformat(),'sources':[],'repositories':{}}
    for repo,paths in SELECTIONS.items():
        commit=gh_json(f'repos/majed354/{repo}/commits/main');sha=commit['sha']
        tree=gh_json(f'repos/majed354/{repo}/git/trees/{sha}?recursive=1')
        (root/'metadata').mkdir(exist_ok=True)
        (root/'metadata'/f'{repo}-tree.json').write_text(json.dumps(tree,ensure_ascii=False),encoding='utf-8')
        blobs={x['path']:x for x in tree['tree'] if x['type']=='blob'}
        manifest['repositories'][repo]={'commit':sha,'commitDate':commit['commit']['committer']['date']}
        for path in paths:
            if path not in blobs:continue
            endpoint=f'repos/majed354/{repo}/contents/{urllib.parse.quote(path,safe="/")}?ref={sha}'
            data=subprocess.check_output(['gh','api',endpoint,'-H','Accept: application/vnd.github.raw+json'])
            blob=hashlib.sha1(b'blob '+str(len(data)).encode()+b'\0'+data).hexdigest()
            if blob!=blobs[path]['sha']:raise ValueError(f'Blob verification failed for {repo}/{path}')
            local=root/'github'/repo/path;local.parent.mkdir(parents=True,exist_ok=True);local.write_bytes(data)
            manifest['sources'].append({'id':f'{repo}:{path}:{blob}','repository':repo,'path':path,'commit':sha,'blob':blob,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data),'localPath':str(local),'url':f'https://github.com/majed354/{repo}/blob/{sha}/{urllib.parse.quote(path,safe="/")}'})
        (root/'source-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'repo':repo,'files':len(paths),'commit':sha},ensure_ascii=False),flush=True)

if __name__=='__main__':main()
