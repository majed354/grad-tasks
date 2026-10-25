import pathlib,sys,tempfile,json,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
import harvest_graduates as h
from merge_local_data import merge,same_title

class MergeLocalTests(unittest.TestCase):
 def test_verse_ranges_do_not_collapse_into_one_thesis(self):
  a='القراءات الشاذة وأثرها في التفسير والأحكام من الآية 10 إلى الآية 20 جمعا ودراسة'
  b=a.replace('20','30')
  self.assertFalse(same_title(a,b));self.assertTrue(same_title(a,a+' .'))
 def test_preserves_identity_and_related_records_while_attaching_periods(self):
  now='2026-10-25T00:00:00+00:00';s=h.student_base('44123456','طالب افتراضي','الفقه','ماجستير',now);s['id']='stable-synthetic';s['tasks']=[{'id':'keep','title':'مهمة افتراضية'}]
  with tempfile.TemporaryDirectory() as folder:
   root=pathlib.Path(folder);(root/'output').mkdir()
   def write(name,data):(root/name).write_text(json.dumps(data,ensure_ascii=False))
   src={'id':'synthetic','localPath':str(root/'synthetic.xls')};write('census-source-manifest.json',{'sources':[src]});rows=[]
   for period,status in [('471','مؤجل'),('481','منتظم')]:rows.append({'studentNumber':s['studentNumber'],'fullName':s['fullName'],'program':'الفقه','degree':'ماجستير','sourceId':'synthetic','sourceDate':'2026-10-07','period':period,'academicYear':'14'+period[:2],'semester':period[-1],'status':status,'locator':period+' row 2','gpaRaw':'0','department':'الشريعة','gender':'ذكر'})
   write('census-observations.json',{'observations':rows});write('research-source-manifest.json',{'sources':[]});write('research-link-proposals.json',{'verifiedIdentityProposals':[],'conflicts':[]});write('output/theses-master.json',{'theses':[]});write('contact-observations.json',{'sources':[],'matchedProposals':[]})
   result,issues=merge({'students':[s],'schemaVersion':1,'revision':1,'activity':[]},root,root,now);out=result['students'][0]
   self.assertEqual(out['id'],'stable-synthetic');self.assertEqual(out['tasks'],s['tasks']);self.assertEqual(len(out['academicSnapshots']),2);self.assertEqual(out['asOfPeriod'],'481');self.assertEqual(out['status'],'منتظم');self.assertEqual(out['gpa'],0);self.assertIsNone(out['gpaScale']);self.assertEqual(issues,[])
   again,_=merge(result,root,root,now);self.assertEqual(len(again['students'][0]['academicSnapshots']),2);self.assertEqual(len(again['students'][0]['evidence']),2)

if __name__=='__main__':unittest.main()
