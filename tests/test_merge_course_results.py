import copy,pathlib,sys,unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from merge_course_results import merge
from harvest_graduates import key
class ResultMergeTests(unittest.TestCase):
 def test_additive_idempotent_merge_preserves_status_identity_and_manual_records(self):
  s={'id':'synthetic','studentNumber':'SYN-RESULT','fullName':'طالب افتراضي','program':'الفقه','degree':'ماجستير','status':'منتظم','evidence':[],'courses':[{'id':'manual'}],'academicSnapshots':[{'period':'481'}],'updatedAt':'old'}
  base={'students':[s]};before=copy.deepcopy(base)
  source={'local-result:synthetic':{'sha256':'synthetic','aliases':[{'path':'/synthetic/source.xls'}]}}
  raw={'studentId':s['id'],'studentNumber':s['studentNumber'],'fullName':s['fullName'],'enrollmentKey':key(s['studentNumber'],s['program'],s['degree']),'sourceId':'local-result:synthetic','sourceDate':'2026-06-30','courseCode':'SYN-3','courseTitle':'مقرر افتراضي','period':'472','activity':'نظري','section':'SYN','gradeRaw':'هـ','totalRaw':'0','locator':'HTML row 12','linkBasis':'number_name_program_degree'}
  out,changed=merge(base,[raw,{**raw,'gradeRaw':'أ','locator':'HTML row 13'}],source,'2026-10-26T10:00:00Z')
  self.assertEqual(base,before);self.assertEqual(changed,{'synthetic'});n=out['students'][0]
  self.assertEqual(n['id'],s['id']);self.assertEqual(n['status'],'منتظم');self.assertEqual(n['courses'],s['courses']);self.assertEqual(n['academicSnapshots'],s['academicSnapshots']);self.assertEqual(len(n['courseResults']),1);self.assertEqual(len(n['courseResults'][0]['observations']),2)
  again,changes=merge(out,[raw],source,'later');self.assertFalse(changes);self.assertEqual(again,out)
  with self.assertRaises(ValueError):merge(base,[{**raw,'fullName':'اسم مختلف'}],source,'later')
if __name__=='__main__':unittest.main()
