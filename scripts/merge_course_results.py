"""Create an additive, private JSON patch from audited course observations.

Never changes enrollment status, manual courses, academic snapshots, or sources.
Run against a fresh browser backup; import only after the new schema is deployed.
"""
import argparse, collections, copy, datetime as dt, hashlib, json, pathlib, uuid
from harvest_graduates import key, namekey

NS = uuid.UUID('11f130d9-c3b7-49e0-85ae-72b0b7a7d81f')
def uid(value): return str(uuid.uuid5(NS, value))
def event_key(r): return (r['code'], r['period'], r['activity'], r['section'])
def observation_key(o): return tuple(o.get(k, '') for k in ['gradeRaw', 'totalRaw', 'sourceDate', 'titleRaw'])

def merge(baseline, observations, sources, observed_at):
    merged = copy.deepcopy(baseline)
    students = {s['id']: s for s in merged['students']}
    changed = set()
    for raw in observations:
        s = students.get(raw['studentId'])
        if not s or key(s['studentNumber'], s['program'], s['degree']) != raw['enrollmentKey'] or namekey(s['fullName']) != namekey(raw['fullName']):
            raise ValueError('Fresh backup does not match the audited enrollment identity')
        before = json.dumps(s, sort_keys=True, ensure_ascii=False)
        source = sources[raw['sourceId']]
        aliases = [a['path'] for a in source['aliases']]
        path = sorted(aliases, key=lambda p: (any(t in p for t in ['/uploads/', '/jobs/', '/private-data/']), len(p)))[0]
        evidence_id = uid('result-source:' + s['id'] + ':' + source['sha256'])
        if not any(e['id'] == evidence_id for e in s['evidence']):
            s['evidence'].append({'id': evidence_id, 'sourceId': raw['sourceId'], 'kind': 'كشف نتائج مقررات تاريخي',
                'sourceName': pathlib.Path(path).name, 'sourcePath': path, 'url': '',
                'locator': 'الصفوف المحددة داخل شواهد نتائج المقررات', 'observedAt': observed_at,
                'fields': ['courseResults'], 'rawDate': raw['sourceDate'], 'calendar': 'ميلادي' if raw['sourceDate'] else 'غير محدد',
                'notes': 'SHA-256: ' + source['sha256'] + '. الفصل والرمز من نص كشف النتائج؛ لا يغيران حالة القيد. قرينة المطابقة: ' + raw['linkBasis']})
        identity = (raw['courseCode'], raw['period'], raw['activity'], raw['section'])
        result = next((r for r in s.setdefault('courseResults', []) if event_key(r) == identity), None)
        if result is None:
            result = {'id': uid('course-result:' + s['id'] + ':' + json.dumps(identity, ensure_ascii=False)),
                'code': raw['courseCode'], 'title': raw['courseTitle'] or raw['courseCode'],
                'period': raw['period'], 'activity': raw['activity'], 'section': raw['section'], 'observations': []}
            s['courseResults'].append(result)
        incoming = {'gradeRaw': raw['gradeRaw'], 'totalRaw': raw.get('totalRaw', ''), 'sourceDate': raw['sourceDate'],
                    'titleRaw': raw['courseTitle'], 'references': []}
        observation = next((o for o in result['observations'] if observation_key(o) == observation_key(incoming)), None)
        if observation is None:
            observation = incoming
            result['observations'].append(observation)
        reference = {'evidenceId': evidence_id, 'locator': raw['locator']}
        if reference not in observation['references']:
            observation['references'].append(reference)
        if json.dumps(s, sort_keys=True, ensure_ascii=False) != before:
            changed.add(s['id'])
    for s in merged['students']:
        if s['id'] in changed: s['updatedAt'] = observed_at
    return merged, changed

def main():
    ap = argparse.ArgumentParser();ap.add_argument('--baseline', type=pathlib.Path, required=True);ap.add_argument('--audit', type=pathlib.Path, required=True);ap.add_argument('--output', type=pathlib.Path, required=True);args=ap.parse_args()
    root = args.output.resolve()
    if 'private-data' not in root.parts: raise SystemExit('Use a private-data output directory')
    root.mkdir(parents=True, exist_ok=True)
    baseline = json.loads(args.baseline.read_text());observations = json.loads((args.audit/'result-observations.json').read_text())['observations'];sources = {s['id']: s for s in json.loads((args.audit/'source-manifest.json').read_text())['sources']}
    merged, changed = merge(baseline, observations, sources, dt.datetime.now(dt.timezone.utc).isoformat())
    old = {s['id']: s for s in baseline['students']}
    for s in merged['students']:
        for field, value in old[s['id']].items():
            if field not in ['evidence', 'courseResults', 'updatedAt']: assert s[field] == value, field
        assert s['evidence'][:len(old[s['id']]['evidence'])] == old[s['id']]['evidence']
    again, repeat_changed = merge(merged, observations, sources, '2026-10-26T00:00:00+00:00')
    assert not repeat_changed and again == merged
    patch = {**merged, 'students': [s for s in merged['students'] if s['id'] in changed]}
    for name, value in [('merged-workspace.grad.json', merged), ('course-results-patch.grad.json', patch)]:
        (root/name).write_text(json.dumps(value, ensure_ascii=False, indent=2))
    summary = {'baselineSHA256': hashlib.sha256(args.baseline.read_bytes()).hexdigest(), 'students':len(merged['students']), 'changedStudents':len(changed),
        'courseResults':sum(len(s.get('courseResults', [])) for s in merged['students']),
        'references':sum(len(o['references']) for s in merged['students'] for r in s.get('courseResults', []) for o in r['observations']),
        'maxEvidencePerStudent':max(len(s['evidence']) for s in merged['students']), 'repeatMergeChanged':len(repeat_changed),
        'patchBytes':(root/'course-results-patch.grad.json').stat().st_size}
    (root/'merge-verification.json').write_text(json.dumps(summary, indent=2));print(json.dumps(summary))

if __name__ == '__main__': main()
