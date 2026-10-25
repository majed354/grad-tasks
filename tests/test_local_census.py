import pathlib, sys, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/'scripts'))
from inspect_local_census import parse, clean

class LocalCensusTests(unittest.TestCase):
 def source(self,created=True):
  stamp='<o:Created>2026-10-07 11-19-49</o:Created>' if created else ''
  headings=['الرقم الجامعي','الاسم','التخصص','الدرجة العلمية','الحالة','المعدل']
  rows=[headings,['44123456','طالب افتراضي','الفقه','الماجستير','منتظم','0'],headings,['44123457','طالب آخر افتراضي','الشريعة','بكالوريوس','منتظم','3']]
  return (stamp+'<table>'+''.join('<tr>'+''.join('<td>'+c+'</td>' for c in row)+'</tr>' for row in rows)+'</table>').encode('cp1256')
 def test_preserves_source_date_zero_and_original_locator_without_duplicate_headers(self):
  result=parse(self.source(),'481.xls')
  self.assertTrue(result['hasCensusHeader']);self.assertEqual(result['allStudentRows'],2);self.assertEqual(result['postgraduateRows'],1);self.assertEqual(result['createdInSource'],'2026-10-07');self.assertEqual(result['records'][0]['gpaRaw'],'0');self.assertEqual(result['records'][0]['locator'],'HTML row 2');self.assertEqual(clean(0),'0')
 def test_missing_export_date_stays_unknown(self):
  self.assertEqual(parse(self.source(created=False),'481.xls')['createdInSource'],'')

if __name__=='__main__':unittest.main()
