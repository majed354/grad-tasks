"""Build a private, source-backed graduate register and a separate matching queue.

No name-only link is accepted. A council page must supply the academic number
and corroborate the thesis title. OCR links stay pending until visually reviewed.
"""
from __future__ import annotations
import argparse, collections, csv, datetime as dt, difflib, hashlib, io, json, pathlib, re, unicodedata, uuid

NS=uuid.UUID('f1239887-5c38-468b-b4a5-78a32ec1c9ee')
FIELDS={'الاسم':'fullName','الرقم_الجامعي':'studentNumber','التخصص':'program','الدرجة':'degree','القسم':'department','الحالة':'status','الجنس':'gender','الجنسية':'nationality','تاريخ_القبول':'admissionDate','تاريخ_التخرج':'graduationDate','المعدل':'gpa'}
STATUS={'منتظم':'منتظم','متخرج':'متخرج','مؤجل':'مؤجل','معتذر':'معتذر','منسحب':'منسحب','مطوي قيده':'مطوي القيد','منقطع عن الدراسة':'منقطع','مفصول اكاديميا':'مفصول أكاديميًا','مؤجل قبول':'مؤجل قبول'}
SOURCE_LABEL={'students_detail':'كشف الطلاب','graduates_detail':'كشف الخريجين','non_completers':'كشف غير المكملين'}

def uid(value):return str(uuid.uuid5(NS,value))
def norm(value):
 s=unicodedata.normalize('NFKC',str(value or '')).translate(str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹','01234567890123456789'))
 s=re.sub(r'[\u064b-\u065f\u0670ـ\u200e\u200f\u202a-\u202e\u2066-\u2069]','',s).translate(str.maketrans('أإآى','اااي'))
 return re.sub(r'\s+',' ',s).strip()
def compact(value):return re.sub(r'[^\w\u0621-\u064a]','',norm(value)).lower()
def namekey(value):return compact(re.sub(r'\b(?:بن|بنت)\b',' ',norm(value)))
def compatible_name(document_name,roster_name):
 # Abbreviation is allowed only alongside a visually checked academic number and program.
 # A different family name is a conflict, never an alias inferred from the number.
 def tokens(v):return [x.replace('ة','ه') for x in re.sub(r'\b(?:بن|بنت)\b',' ',norm(v)).split()]
 a,b=tokens(document_name),tokens(roster_name)
 return len(a)>=2 and len(b)>=2 and a[0]==b[0] and a[-1]==b[-1] and all(x in b for x in a)
def degree(value):return 'ماجستير' if 'ماجستير' in norm(value) else 'دكتوراه' if 'دكتور' in norm(value) else ''
def program(value,deg):
 v=norm(value)
 if v in [norm('قراءات'),norm('القراءات')]:return 'القراءات'
 if v in [norm('دراسات قرآنية'),norm('الدراسات القرآنية')]:return 'الدراسات القرآنية المعاصرة' if deg=='ماجستير' else 'الدراسات القرآنية'
 canonical={norm(x):x for x in ['أصول الفقه','الفقه','العقيدة','القانون','الدراسات القرآنية المعاصرة']}
 return canonical.get(v,v)
def year(value):
 try:n=int(float(str(value)));return n+1400 if n<100 else n
 except (ValueError,TypeError):return 0
def key(number,prog,deg):return norm(number)+'|'+norm(prog)+'|'+deg
def read_csv(path):
 text=pathlib.Path(path).read_text(encoding='utf-8-sig');dialect=csv.Sniffer().sniff(text[:10000],delimiters=',;\t');return list(csv.DictReader(io.StringIO(text),dialect=dialect))
def read_sheet(path):
 d=json.loads(pathlib.Path(path).read_text());heads=d['values'][0];return [(i+2,dict(zip(heads,values))) for i,values in enumerate(d['values'][1:]) if any(str(v).strip() for v in values)]
def valid_date(value):
 try:return dt.date.fromisoformat(str(value)).isoformat()
 except (ValueError,TypeError):return ''
def number_value(value):
 try:n=float(str(value));return n if 0<=n<=5 else None
 except (ValueError,TypeError):return None
def evidence(source,row,fields,observed,kind='سجل مصدر',raw_date='',calendar='غير محدد',notes=''):
 return {'id':uid(source['id']+':'+str(row)+':'+kind),'sourceId':source['id'],'kind':kind,'url':source['url'],'locator':str(row),'observedAt':observed,'fields':fields,'rawDate':raw_date,'calendar':calendar,'notes':notes}
def student_base(number,name,prog,deg,now):
 return {'id':uid('student:'+key(number,prog,deg)),'studentNumber':norm(number),'fullName':re.sub(r'\s+',' ',name).strip(),'program':prog,'degree':deg,'department':'','gender':'غير محدد','cohort':'','admissionDate':'','status':'غير موثق','stage':'غير موثق','email':'','phone':'','nationality':'','gpa':None,'gpaScale':None,'completedCredits':None,'requiredCredits':None,'supervisor':'','coSupervisor':'','thesisTitle':'','proposalDate':'','defenseDate':'','graduationDate':'','expectedEndDate':'','source':'','sourceDate':'','notes':'','tasks':[],'courses':[],'decisions':[],'documents':[],'followUps':[],'evidence':[],'researchRecords':[],'asOfAcademicYear':'','createdAt':now,'updatedAt':now}

def build_students(sources,manifest,now):
 groups=collections.defaultdict(list);raw_rows=0
 for name in ['students_detail','graduates_detail','non_completers']:
  src=next(s for s in manifest['sources'] if s['repository']=='KPI_TaifShare3h' and s['path']==f'data/{name}.csv')
  for n,r in enumerate(read_csv(src['localPath']),2):
   deg=degree(r.get('الدرجة'));prog=program(r.get('التخصص'),deg)
   if not deg:continue
   raw_rows+=1;groups[key(r['الرقم_الجامعي'],prog,deg)].append({'source':src,'kind':name,'row':n,'year':year(r.get('السنة',r.get('آخر_سنة'))),'data':r,'status':'متخرج' if name=='graduates_detail' else STATUS.get(r.get('الحالة'),'غير موثق')})
 students={};issues=[];normalization_count=0
 for identity,observations in groups.items():
  observations.sort(key=lambda x:(x['year'],{'non_completers':0,'students_detail':1,'graduates_detail':2}[x['kind']]),reverse=True);latest=observations[0];r=latest['data'];deg=degree(r['الدرجة']);prog=program(r['التخصص'],deg)
  names={o['data']['الاسم'] for o in observations};name_keys={namekey(n) for n in names}
  if len(names)>1:normalization_count+=1
  if len(name_keys)>1:issues.append({'kind':'identity_conflict','studentKey':identity,'names':sorted(names)});continue
  s=student_base(r['الرقم_الجامعي'],r['الاسم'],prog,deg,now);s['asOfAcademicYear']=str(latest['year']);s['department']=r.get('القسم','');s['gender']=r.get('الجنس') if r.get('الجنس') in ['ذكر','أنثى'] else 'غير محدد';s['nationality']=r.get('الجنسية','')
  statuses={o['status'] for o in observations if o['year']==latest['year']};s['status']=latest['status'] if len(statuses)==1 else 'غير موثق'
  if len(statuses)>1:issues.append({'kind':'same_year_status_conflict','studentKey':identity,'year':latest['year'],'statuses':sorted(statuses)})
  def distinct(column):return {o['data'].get(column,'').strip() for o in observations if o['data'].get(column,'').strip()}
  for col,target in [('تاريخ_القبول','admissionDate'),('تاريخ_التخرج','graduationDate')]:
   vals=distinct(col)
   if len(vals)==1:s[target]=valid_date(next(iter(vals)))
   elif len(vals)>1:issues.append({'kind':'date_conflict','studentKey':identity,'field':target,'values':sorted(vals)})
  # GPA is preserved without inventing its denominator. Expected dates remain raw evidence.
  s['gpa']=number_value(r.get('المعدل'));s['stage']='متخرج' if s['status']=='متخرج' else 'غير موثق'
  s['source']=f"{SOURCE_LABEL[latest['kind']]} — آخر سنة مرصودة {latest['year']}";s['notes']='سجل تاريخي؛ سنة الرصد ليست تأكيدًا للحالة الحالية. لم يثبت فصل الالتحاق أو مقياس المعدل أو إصدار الخطة.\nتاريخ الجمع: '+now[:10]+'.'
  for o in observations:
   raw=o['data'];fields=[target for col,target in FIELDS.items() if raw.get(col,'')!=''];loc=f"CSV row {o['row']}";ev=evidence(o['source'],loc,fields,now,'كشف طلاب تاريخي',str(o['year']),'سنة أكاديمية',f"{SOURCE_LABEL[o['kind']]}؛ الملف الأصلي المسمى في المصدر: {raw.get('مصدر_الملف','غير مسجل')}")
   s['evidence'].append(ev);s['followUps'].append({'id':uid(ev['id']+':history'),'date':'','text':f"السنة {o['year']}: الحالة المصدرية {raw.get('الحالة','متخرج (كشف الخريجين)')}؛ المعدل كما ورد {raw.get('المعدل','غير مسجل')}؛ التخرج المتوقع كما ورد {raw.get('تاريخ_التخرج_المتوقع','غير مسجل')}؛ المرجع {o['source']['url']} — صف {o['row']}."})
  students[identity]=s
 return students,issues,{'rosterSourceRows':raw_rows,'rosterUniqueEnrollments':len(students),'repeatedEnrollmentObservations':raw_rows-len(groups),'nameFormattingVariantsMerged':normalization_count}

def build_theses(sources,manifest,now):
 faculty_source=next(s for s in manifest['sources'] if s['repository']=='faculty-activities' and s['path']=='data/faculty.csv');faculty=collections.defaultdict(list)
 for n,r in enumerate(read_csv(faculty_source['localPath']),2):faculty[str(r['id'])].append((n,r))
 live_file=sources/'google-sheets/theses.json';live=json.loads(live_file.read_text());live_source={'id':'google-sheets:theses:'+hashlib.sha256(live_file.read_bytes()).hexdigest(),'url':live['url']}
 git_source=next(s for s in manifest['sources'] if s['repository']=='faculty-activities' and s['path']=='data/theses.csv')
 observations=[]
 for n,r in enumerate(read_csv(git_source['localPath']),2):observations.append((0,n,r,git_source))
 for n,r in read_sheet(live_file):observations.append((1,n,r,live_source))
 groups=collections.defaultdict(list)
 for priority,n,r,src in observations:
  deg=degree(r.get('type'));title=str(r.get('title','')).strip();student=str(r.get('student_name','')).strip()
  if not student or not title or not deg:continue
  # IDs were renumbered between repository and live sheet. They are source locators, not cross-source identities.
  identity=deg+'|'+norm(program(r.get('specialization',''),deg))+'|'+namekey(student)+'|'+compact(title)
  groups[identity].append((priority,n,r,src))
 theses=[];issues=[];missing_faculty=set();name_only_supervisor_refs=0
 for identity,obs in groups.items():
  obs.sort(key=lambda x:x[0],reverse=True);_,n,r,src=obs[0];deg=degree(r.get('type'));t={'id':uid('thesis:'+identity),'studentName':str(r['student_name']).strip(),'degree':deg,'program':program(r.get('specialization',''),deg),'title':str(r['title']).strip(),'year':str(r.get('year','')),'status':str(r.get('status','')),'defenseDateRaw':str(r.get('defense_date','')),'defenseCalendar':'هجري' if re.match(r'^14\d{2}',str(r.get('defense_date',''))) else 'ميلادي' if re.match(r'^20\d{2}',str(r.get('defense_date',''))) else 'غير محدد','department':str(r.get('department','')),'evidence':[],'observations':[],'linkedStudentKey':None,'verification':'للمراجعة'}
  for role,col in [('supervisor','supervisor_id'),('coSupervisor','co_supervisor_id'),('examiner1','examiner1_id'),('examiner2','examiner2_id')]:
   ident=str(r.get(col,'')).strip();t[role+'Id']=ident if re.fullmatch(r'\d+',ident) else '';t[role]=''
   if ident and ident in faculty:
    matches=faculty[ident];row,member=max(matches,key=lambda x:(x[1].get('year')==t['year'],year(x[1].get('year'))));t[role]=member['name'];t['evidence'].append(evidence(faculty_source,f'CSV row {row}; role {role}',[role],now,'هوية عضو برقم وظيفي',str(member.get('year','')),'سنة أكاديمية',f'ربط مباشر بالمعرف {ident}'))
   elif ident and re.fullmatch(r'\d+',ident):missing_faculty.add(ident)
   elif ident:t[role]=ident;name_only_supervisor_refs+=1
  for _,row,raw,source in obs:
   t['evidence'].append(evidence(source,f"{'Sheet' if source is live_source else 'CSV'} row {row}",['studentName','title','degree','program','supervisorId','coSupervisorId','examiner1Id','examiner2Id','status','defenseDateRaw'],now,'سجل رسالة',str(raw.get('defense_date','')) or str(raw.get('year','')),'هجري' if re.match(r'^14\d{2}',str(raw.get('defense_date',''))) else 'غير محدد','حالة الرسالة لا تثبت تخرج الطالب.'))
   t['observations'].append({'sourceId':source['id'],'row':row,'recordId':raw.get('id'),'raw':raw})
  for col in ['supervisor_id','co_supervisor_id','examiner1_id','examiner2_id','status','defense_date']:
   values={str(x[2].get(col,'')) for x in obs if str(x[2].get(col,''))}
   if len(values)>1:issues.append({'kind':'thesis_source_difference','thesisId':t['id'],'field':col,'values':sorted(values),'selection':'live sheet preferred; all observations retained'})
  theses.append(t)
 return theses,issues,{'thesisSourceRows':len(observations),'liveThesisRows':len(read_sheet(live_file)),'gitThesisRows':len(read_csv(git_source['localPath'])),'uniqueTheses':len(theses),'duplicateThesisObservations':len(observations)-len(theses),'unresolvedFacultyIds':sorted(missing_faculty),'facultyReferencesWithNamesInsteadOfIds':name_only_supervisor_refs}

def attach_source_evidence(sources,theses,now):
 path=sources/'google-sheets/research_evidence.json'
 if not path.exists():return []
 meta=json.loads(path.read_text());src={'id':'google-sheets:research-evidence:'+hashlib.sha256(path.read_bytes()).hexdigest(),'url':meta['url']};pending=[]
 for row,r in read_sheet(path):
  if r.get('dataset')!='theses':continue
  matches=[t for t in theses if any(str(o.get('recordId'))==str(r.get('record_id')) and o['sourceId'].startswith('google-sheets:theses:') for o in t['observations'])]
  if len(matches)!=1 or compact(r.get('title'))!=compact(matches[0]['title']):
   pending.append({'kind':'source_evidence_locator_or_title_mismatch','sourceId':src['id'],'row':row,'recordId':r.get('record_id')});continue
  t=matches[0];t['evidence'].append(evidence(src,f'Sheet row {row}',r.get('supported_fields','').split('|'),now,'فهرس أدلة المصدر',r.get('discovered_at',''),'غير محدد','إحالة مسجلة في شيت المصدر؛ لم تعاين الوثيقة المحال إليها ضمن هذا الجمع. الرابط أو المعرف كما ورد: '+r.get('source_url','')+'؛ '+r.get('source_title','')+'؛ '+r.get('notes','')))
 return pending

def title_support(title,text):
 a=compact(title);b=compact(text)
 if len(a)>=35 and a in b:return {'supported':True,'method':'exact normalized full title','coverage':1.0}
 tokens={x for x in re.findall(r'[\u0621-\u064a]+',norm(title)) if len(x)>=4 and x not in {'دراسة','دراسه','جمعا','المسائل','مسائل','العلمية','العلميه','رسالة','رساله','المقدمة'}}
 found={t for t in tokens if compact(t) in b};coverage=len(found)/max(len(tokens),1)
 return {'supported':len(found)>=5 and coverage>=.70,'method':'distinct title tokens','coverage':round(coverage,3),'matchedTokens':sorted(found)}

def council_rows(sources):
 rows=read_csv(sources/'github/IndexForMeeting/data/councils.csv');out=collections.defaultdict(list)
 for n,r in enumerate(rows,2):
  path=r['مسار PDF'] or 'pdfs/'+r['السنة الهجرية'][-2:]+r['الشهر الهجري'].zfill(2)+'-'+r['رقم المجلس'].zfill(2)+'.pdf';out[path].append((n,r))
 return out
def blocks_for_number(text,number):
 positions=[m for m in re.finditer(r'(?<!\d)'+re.escape(number)+r'(?!\d)',text)];allnums=list(re.finditer(r'(?<!\d)\d{8,9}(?!\d)',text));blocks=[]
 for m in positions:
  start=max(0,m.start()-650);end=min(len(text),m.end()+1200)
  previous=[x for x in allnums if x.end()<m.start() and x.group()!=number];following=[x for x in allnums if x.start()>m.end() and x.group()!=number]
  if previous:start=max(start,previous[-1].end())
  if following:end=min(end,following[0].start())
  # A new paragraph beginning with عرض normally starts the next student's request.
  cuts=list(re.finditer(r'\n\s*عرض',text[m.end():end]))
  if cuts:end=min(end,m.end()+cuts[0].start())
  blocks.append(text[start:end])
 return blocks
def classify_decision(text):
 labels=[('تشكيل لجنة مناقشة',['تشكيل','مناقش']),('تعديل عنوان الرسالة',['تعديل','عنوان']),('اعتماد خطة البحث',['خطة','بحث']),('تعيين أو تغيير مشرف',['مشرف']),('طلب تمديد',['تمديد']),('طلب إعادة قيد',['إعادة','قيد']),('طلب تأجيل',['تأجيل']),('طلب اعتذار',['اعتذار']),('طلب اختبار بديل',['اختبار','بديل'])]
 for label,words in labels:
  if all(compact(w) in compact(text) for w in words):return label
 return 'موضوع مجلس مرتبط بالطالب'

def link_councils(root,sources,students,theses,now):
 index=council_rows(sources);by_number=collections.defaultdict(list)
 for k,s in students.items():by_number[s['studentNumber']].append(k)
 thesis_names=collections.defaultdict(list)
 for t in theses:thesis_names[(namekey(t['studentName']),t['degree'],t['program'])].append(t)
 pending=[];links=[];page_count=0;number_pages=0;new_students=0
 for path in sorted((root/'council-text').glob('*.json')):
  if path.name=='index.json':continue
  doc=json.loads(path.read_text());source=doc['source'];rows=index.get(source['path'],[]);dept=rows[0][1]['القسم'] if rows else '';academic=rows[0][1]['السنة الهجرية'] if rows else '';council=rows[0][1]['رقم المجلس'] if rows else '';month=rows[0][1]['الشهر الهجري'] if rows else ''
  for original in doc['pages']:
   page=original;method='embedded-text';ocr_path=root/'council-ocr'/(source['blob']+f"-{page['page']}.json")
   if not page['textUsable']:
    if not ocr_path.exists():continue
    page=json.loads(ocr_path.read_text());method='ocr'
    if not page['textUsable']:continue
   page_count+=1;text=page['text'];nums=set(re.findall(r'(?<!\d)\d{8,9}(?!\d)',text))
   if nums:number_pages+=1
   for number in nums:
    blocks=blocks_for_number(text,number)
    identity_context=any(re.search(r'(?:الرقم\s*الجامعي|رقمها?\s*الجامعي|رقمه\s*الجامعي|بالرقم\s*الجامعي|رقم\s*جامعي)',norm(b)) for b in blocks)
    if not identity_context:continue
    candidates=by_number.get(number,[])
    if not candidates:
     for t in theses:
      if not namekey(t['studentName']) or not any(namekey(t['studentName']) in namekey(b) and title_support(t['title'],b)['supported'] for b in blocks):continue
      k=key(number,t['program'],t['degree'])
      pending.append({'kind':'unlisted_student_number_requires_review','studentKey':k,'thesisId':t['id'],'sourceId':source['id'],'page':page['page']})
    if len(candidates)>1:
     candidates=[k for k in candidates if degree(' '.join(blocks))==students[k]['degree'] and compact(students[k]['program']) in compact(' '.join(blocks))]
    if len(candidates)!=1:
     if candidates:pending.append({'kind':'ambiguous_enrollment','studentNumber':number,'candidates':candidates,'sourceId':source['id'],'page':page['page']})
     continue
    k=candidates[0];s=students[k];name_match=any(namekey(s['fullName']) in namekey(b) for b in blocks);accepted=method=='embedded-text' and name_match
    locator=f"PDF page {page['page']}";ev=evidence(source,locator,['studentNumber','councilTopic'],now,'محضر مجلس',f'{academic}-{month.zfill(2)}' if academic else '', 'هجري',f'قسم {dept}؛ المجلس {council}؛ الربط بالرقم الجامعي؛ طريقة القراءة {method}.')
    record={'id':uid(ev['id']+':'+number),'studentKey':k,'studentId':s['id'],'sourceId':source['id'],'sourceUrl':source['url'],'path':source['path'],'page':page['page'],'method':method,'numberExplicit':True,'nameCorroborates':name_match,'reviewed':accepted,'blocks':blocks}
    if not accepted:pending.append({'kind':'ocr_decision_pending',**record})
    else:
     if not any(x['id']==ev['id'] for x in s['evidence']):s['evidence'].append(ev)
     matching_topics=[r['الموضوع (مختصر)'] for _,r in rows if namekey(s['fullName']) in namekey(r['الموضوع (مختصر)'])]
     title=matching_topics[0] if matching_topics else classify_decision(' '.join(blocks))
     s['decisions'].append({'id':record['id'],'title':title,'number':'','date':'','council':f'مجلس قسم {dept} رقم {council} — {academic}هـ','page':str(page['page']),'url':source['url'],'notes':f'محضر وتوصية مجلس، ولا يثبت وحده اعتماد الجامعة أو تنفيذ الإجراء. المرجع الهجري: {academic}/{month}. الربط بالرقم الجامعي؛ تفاصيل الطلب الشخصية تبقى في المحضر الأصلي. تصنيف الموضوع آلي إن لم يسم الفهرس الطالب صراحة.'})
     links.append(record)
    possible=thesis_names.get((namekey(s['fullName']),s['degree'],s['program']),[])
    for t in possible:
     titles=list({str(o['raw'].get('title','')) for o in t['observations']});support=[{**title_support(title,b),'sourceTitle':title} for b in blocks for title in titles];verified=any(x['supported'] for x in support)
     if not verified:continue
     relation={'kind':'thesis_council_number_title','studentKey':k,'thesisId':t['id'],'sourceId':source['id'],'page':page['page'],'method':method,'support':support}
     if not accepted:pending.append({'kind':'ocr_thesis_pending',**{a:b for a,b in relation.items() if a!='kind'}});continue
     if t['linkedStudentKey'] and t['linkedStudentKey']!=k:pending.append({'kind':'thesis_identity_conflict',**relation});continue
     t['linkedStudentKey']=k;t['verification']='موثق';tev=evidence(source,locator,['studentNumber','title','degree','program'],now,'ربط رسالة برقم جامعي',f'{academic}-{month.zfill(2)}','هجري','رقم جامعي صريح وعنوان رسالة مؤيد في السياق نفسه؛ الاسم وحده لم يعتمد.')
     if not any(x['id']==tev['id'] for x in t['evidence']):t['evidence'].append(tev)
 return pending,links,{'councilUsablePagesScanned':page_count,'councilPagesWithPossibleStudentNumber':number_pages,'newStudentsFromCouncilEvidence':new_students}

def apply_visual_review(root,sources,students,theses,now):
 """Accept individually transcribed relationships, never blanket approval of OCR pages."""
 review=json.loads((root/'visual-review.json').read_text());docs={}
 for p in (root/'council-text').glob('*.json'):
  if p.name!='index.json':
   doc=json.loads(p.read_text());docs[doc['source']['path']]=doc
 index=council_rows(sources);pending=[];links=[];issues=[];counts=collections.Counter()
 for conflict in review.get('identityConflicts',[]):issues.append({'kind':'council_identity_conflict',**conflict})
 for r in review.get('manualTheses',[])+review.get('manualSupervisors',[]):
  k=key(r['studentNumber'],r['program'],r['degree']);s=students.get(k);document_name=r.get('studentName',r.get('documentName',''));doc=docs[r['sourcePath']];source=doc['source'];rows=index.get(r['sourcePath'],[]);meta=rows[0][1] if rows else {};academic=meta.get('السنة الهجرية','');month=meta.get('الشهر الهجري','');council=meta.get('رقم المجلس','');dept=meta.get('القسم','');pages=r.get('pages',[r.get('page')]);pages=[x for x in pages if x];locator='PDF pages '+', '.join(map(str,pages))
  if not s or not compatible_name(document_name,s['fullName']):
   pending.append({'kind':'curated_identity_needs_confirmation','studentKey':k,'documentName':document_name,'rosterName':s['fullName'] if s else None,'sourceId':source['id'],'pages':pages});continue
  counts['acceptedCuratedRelationships']+=1
  ev=evidence(source,locator,['studentNumber','program','degree','title','supervisor'] if r.get('title') else ['studentNumber','program','degree','supervisor'],now,'محضر مقروء بصريًا',academic+'-'+month.zfill(2),'هجري',f"قسم {dept}؛ المجلس {council}؛ فحص الرقم الجامعي والاسم والبرنامج في الصفحة الأصلية. الاسم في المحضر: {document_name}. المشرف كما ورد: {r.get('supervisor','غير مقروء')}. "+r.get('status','توصية بتمديد المدة النظامية'))
  s['evidence'].append(ev);decision_id=uid(ev['id']+':'+s['studentNumber']);s['decisions'].append({'id':decision_id,'title':r.get('status','توصية بتمديد المدة النظامية'),'number':'','date':'','council':f'مجلس قسم {dept} رقم {council} — {academic}هـ','page':', '.join(map(str,pages)),'url':source['url']+'#page='+str(pages[0]),'notes':'توصية مجلس بحسب المحضر؛ لا تثبت وحدها اعتماد الجامعة أو تنفيذ الإجراء. '+('عنوان الرسالة: '+r['title']+'. ' if r.get('title') else '')+'المشرف كما ورد: '+r.get('supervisor','غير مقروء')+'. المرجع الزمني الهجري: '+academic+'/'+month+'.'})
  links.append({'id':decision_id,'studentKey':k,'studentId':s['id'],'sourceId':source['id'],'sourceUrl':source['url'],'path':source['path'],'pages':pages,'method':'visual-transcription','numberExplicit':True,'nameCorroborates':True,'reviewed':True})
  if not s['supervisor'] and r.get('supervisor'):s['supervisor']=r['supervisor']
  if not r.get('title'):continue
  # Existing thesis candidates need a title match as well as compatible names and the reviewed number.
  candidates=[]
  for t in theses:
   if t['program']!=s['program'] or t['degree']!=s['degree'] or not compatible_name(t['studentName'],s['fullName']):continue
   similarity=difflib.SequenceMatcher(None,compact(r['title']),compact(t['title'])).ratio()
   if similarity>=.80 and (title_support(t['title'],r['title'])['supported'] or title_support(r['title'],t['title'])['supported']):candidates.append((similarity,t))
  candidates.sort(key=lambda x:x[0],reverse=True)
  if len(candidates)==1 or len(candidates)>1 and candidates[0][0]-candidates[1][0]>=.08:
   t=candidates[0][1]
   if t['linkedStudentKey'] and t['linkedStudentKey']!=k:
    pending.append({'kind':'curated_thesis_identity_conflict','thesisId':t['id'],'studentKey':k});continue
   t['linkedStudentKey']=k;t['verification']='موثق';t['evidence'].append(ev);counts['existingThesesLinkedByVisualReview']+=1
   if not t['supervisor'] and r.get('supervisor'):
    t['supervisor']=r['supervisor'];t['supervisorId']=''
  else:
   # The original council assertion is independently usable; possible source variants remain in review.
   ident=uid('council-thesis:'+source['id']+':'+s['studentNumber']+':'+compact(r['title']));t={'id':ident,'studentName':document_name,'degree':s['degree'],'program':s['program'],'title':r['title'],'year':academic,'status':r['status'],'defenseDateRaw':'','defenseCalendar':'غير محدد','department':dept,'evidence':[ev],'observations':[{'sourceId':source['id'],'pages':pages,'raw':r}],'linkedStudentKey':k,'verification':'موثق'}
   for role in ['supervisor','coSupervisor','examiner1','examiner2']:t[role]=r.get(role,'');t[role+'Id']=''
   theses.append(t);counts['councilOnlyThesisAssertions']+=1
   if candidates:pending.append({'kind':'source_title_variants_require_review','studentKey':k,'councilThesisId':ident,'candidates':[{'thesisId':x['id'],'similarity':score} for score,x in candidates]})
 return pending,links,issues,dict(counts)

def attach_research(students,theses):
 for t in theses:
  if not t['linkedStudentKey']:continue
  s=students[t['linkedStudentKey']];record={k:t.get(k,'') for k in ['id','title','degree','program','year','status','defenseDateRaw','defenseCalendar','supervisorId','supervisor','coSupervisorId','coSupervisor','examiner1Id','examiner1','examiner2Id','examiner2','verification']};record['evidenceIds']=[x['id'] for x in t['evidence']];s['researchRecords'].append(record)
  for ev in t['evidence']:
   if not any(x['id']==ev['id'] for x in s['evidence']):s['evidence'].append(ev)
 for s in students.values():
  s['researchRecords'].sort(key=lambda t:year(t['year']),reverse=True)
  if s['researchRecords']:
   t=s['researchRecords'][0];s['thesisTitle']=t['title'];s['supervisor']=t['supervisor'];s['coSupervisor']=t['coSupervisor']
   if t['defenseCalendar']=='ميلادي':s['defenseDate']=valid_date(t['defenseDateRaw'])
  s['evidence']=list({e['id']:e for e in s['evidence']}.values());s['decisions']=list({d['id']:d for d in s['decisions']}.values())

def main():
 p=argparse.ArgumentParser();p.add_argument('--root',required=True);a=p.parse_args();root=pathlib.Path(a.root).resolve();sources=root/'sources';manifest=json.loads((sources/'source-manifest.json').read_text());now=manifest['collectedAt'];students,issues,stats=build_students(sources,manifest,now);theses,tissues,tstats=build_theses(sources,manifest,now);pending,links,cstats=link_councils(root,sources,students,theses,now);pending+=attach_source_evidence(sources,theses,now)
 if (root/'visual-review.json').exists():
  vp,vl,vi,vs=apply_visual_review(root,sources,students,theses,now);pending+=vp;links+=vl;issues+=vi;stats.update(vs)
  resolved={(x['studentKey'],x['sourceId'],page) for x in vl for page in x['pages']}
  pending=[x for x in pending if not (x['kind']=='ocr_decision_pending' and (x.get('studentKey'),x.get('sourceId'),x.get('page')) in resolved)]
 attach_research(students,theses)
 by_name=collections.defaultdict(list)
 for k,s in students.items():by_name[(namekey(s['fullName']),s['degree'],s['program'])].append(k)
 for t in theses:
  if not t['linkedStudentKey']:
   candidates=by_name.get((namekey(t['studentName']),t['degree'],t['program']),[])
   pending.append({'kind':'name_candidate_only' if candidates else 'thesis_student_not_identified','thesisId':t['id'],'studentName':t['studentName'],'program':t['program'],'degree':t['degree'],'candidates':candidates,'reason':'لا يعتمد الربط بالاسم دون رقم جامعي وقرينة رسالة من وثيقة.'})
 stats.update(tstats);stats.update(cstats);stats.update({'totalThesisEntitiesIncludingCouncilAssertions':len(theses),'collectedEnrollments':len(students),'linkedTheses':sum(bool(t['linkedStudentKey']) for t in theses),'studentsWithVerifiedThesis':sum(bool(s['researchRecords']) for s in students.values()),'studentsWithCouncilRecords':sum(bool(s['decisions']) for s in students.values()),'verifiedCouncilStudentPageLinks':len(links),'pendingReviewItems':len(pending),'dataIssues':len(issues)+len(tissues),'programs':dict(collections.Counter(s['degree']+' '+s['program'] for s in students.values()))})
 output=root/'output';output.mkdir(exist_ok=True)
 datasets={'students-master.json':{'schemaVersion':'graduate-harvest-v1','collectedAt':now,'students':list(students.values())},'theses-master.json':{'collectedAt':now,'theses':theses},'review-queue.json':{'items':pending,'issues':issues+tissues},'council-links.json':{'links':links},'quality-summary.json':stats,'grad-students-import.grad.json':{'format':'grad-tasks-backup','exportedAt':now,'schemaVersion':1,'revision':0,'students':list(students.values()),'activity':[]}}
 for name,value in datasets.items():(output/name).write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(stats,ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
