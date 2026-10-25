"""Synthetic regression tests for identity, historical status, and source-specific IDs."""
import csv, json, pathlib, sys, tempfile, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import harvest_graduates as h

class HarvestTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.temp.name);self.sources=self.root/'sources';self.sources.mkdir();(self.sources/'google-sheets').mkdir();self.now='2026-10-25T00:00:00+00:00';self.manifest={'sources':[]}
 def tearDown(self):self.temp.cleanup()
 def source(self,repo,path,rows):
  local=self.sources/repo/path;local.parent.mkdir(parents=True,exist_ok=True)
  with local.open('w') as f:
   w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
  src={'id':repo+':'+path,'repository':repo,'path':path,'localPath':str(local),'url':'https://example.com/'+path};self.manifest['sources'].append(src);return src
 def roster(self,status='منتظم',year='45',name='أحمد بن سالم الافتراضي'):
  return {'الرقم_الجامعي':'44123456','الاسم':name,'الدرجة':'ماجستير','التخصص':'الفقه','القسم':'الشريعة','الحالة':status,'السنة':year,'المعدل':'4.2'}
 def test_enrollment_dedup_retains_year_and_conflicting_status(self):
  self.source('KPI_TaifShare3h','data/students_detail.csv',[self.roster(),self.roster(year='46',name='احمد سالم الافتراضي')]);self.source('KPI_TaifShare3h','data/graduates_detail.csv',[self.roster(year='46')]);self.source('KPI_TaifShare3h','data/non_completers.csv',[self.roster(status='منسحب',year='45')])
  students,issues,stats=h.build_students(self.sources,self.manifest,self.now);s=next(iter(students.values()))
  self.assertEqual(len(students),1);self.assertEqual(stats['repeatedEnrollmentObservations'],3);self.assertEqual(s['status'],'غير موثق');self.assertEqual(s['asOfAcademicYear'],'1446');self.assertIsNone(s['gpaScale']);self.assertEqual(s['cohort'],'');self.assertEqual(len(s['evidence']),4);self.assertTrue(any(x['kind']=='same_year_status_conflict' for x in issues))
 def test_number_and_program_do_not_override_a_conflicting_family(self):
  self.assertFalse(h.compatible_name('نايف الأسمري','نايف يوسف السميري'))
  self.assertTrue(h.compatible_name('أحمد الافتراضي','أحمد بن سالم الافتراضي'))
  self.assertNotEqual(h.key('44123456','الفقه','ماجستير'),h.key('44123456','الفقه','دكتوراه'))
 def test_renumbered_thesis_ids_are_not_cross_source_keys(self):
  self.source('faculty-activities','data/faculty.csv',[{'id':'999','year':'1446','name':'مشرف افتراضي'}]);r={'id':'1','year':'1446','type':'ماجستير','specialization':'الفقه','student_name':'أحمد الافتراضي','title':'عنوان رسالة افتراضية أولى','supervisor_id':'999','status':'منجزة','defense_date':'1446-02-03'}
  self.source('faculty-activities','data/theses.csv',[r]);heads=list(r);(self.sources/'google-sheets/theses.json').write_text(json.dumps({'url':'https://example.com/sheet','values':[heads,list({**r,'student_name':'خالد الافتراضي','title':'عنوان رسالة افتراضية مختلفة'}.values())]}))
  theses,issues,stats=h.build_theses(self.sources,self.manifest,self.now)
  self.assertEqual(len(theses),2);self.assertEqual(stats['duplicateThesisObservations'],0);self.assertEqual(theses[0]['defenseCalendar'],'هجري');self.assertTrue(all(t['linkedStudentKey'] is None for t in theses));self.assertEqual(issues,[])
 def test_title_evidence_needs_distinctive_words(self):
  self.assertFalse(h.title_support('رسالة علمية دراسة وجمعا','عرض طلب الطالب ورسالة علمية ودراسة')['supported'])
  self.assertTrue(h.title_support('تفسير القرآن وأثر القراءات الشاذة في الأحكام الفقهية المقارنة','تفسير القرآن وأثر القراءات الشاذة في الأحكام الفقهية المقارنة')['supported'])
 def test_ocr_page_approval_never_promotes_individual_relationships(self):
  r=self.roster();s=h.student_base(r['الرقم_الجامعي'],r['الاسم'],'الفقه','ماجستير',self.now);students={h.key(s['studentNumber'],s['program'],s['degree']):s};text='عرض طلب الطالب أحمد بن سالم الافتراضي الرقم الجامعي 44123456 بالموافقة على خطة بحث'
  self.source('IndexForMeeting','data/councils.csv',[{'مسار PDF':'pdfs/synthetic.pdf','السنة الهجرية':'1446','الشهر الهجري':'02','رقم المجلس':'01','القسم':'الشريعة','الموضوع (مختصر)':'عرض خطط البحث'}]);d=self.sources/'github/IndexForMeeting/data';d.mkdir(parents=True);(d/'councils.csv').write_text((self.sources/'IndexForMeeting/data/councils.csv').read_text())
  (self.root/'council-text').mkdir();(self.root/'council-ocr').mkdir();(self.root/'visual-review.json').write_text(json.dumps({'approvedPages':[{'blob':'synthetic','page':1}]}));source={'id':'synthetic','path':'pdfs/synthetic.pdf','url':'https://example.com/test.pdf','blob':'synthetic'};(self.root/'council-text/synthetic.json').write_text(json.dumps({'source':source,'pages':[{'page':1,'textUsable':False,'text':''}]}));(self.root/'council-ocr/synthetic-1.json').write_text(json.dumps({'page':1,'textUsable':True,'text':text}))
  pending,links,stats=h.link_councils(self.root,self.sources,students,[],self.now)
  self.assertEqual(links,[]);self.assertEqual(s['decisions'],[]);self.assertTrue(any(x['kind']=='ocr_decision_pending' for x in pending))

if __name__=='__main__':unittest.main()
