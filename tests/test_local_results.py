import pathlib
import sys
import unittest
import io
import zipfile
import tempfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / 'scripts'))
from inspect_local_results import clean, extract, grade_symbol, link_record, outcome_differences, period_from_text, probe, probe_is_current, read_groups


class LocalResultsTests(unittest.TestCase):
    def source(self):
        rows = [
            ['للفصل الدراسي الفصل الأول 1447'],
            ['نشاط:', 'نظري', 'شعبة:', '999'],
            ['المقرر:', '9900001-3', 'مقرر افتراضي', 'المدرس:', 'مدرس افتراضي'],
            ['رقم الطالب', 'اسم الطالب', 'المجموع 100%', 'التقدير'],
            ['9990001', 'طالب افتراضي', '0', 'هـ'],
            ['9990002', 'طالب خارج السجل', '0', 'ح'],
            ['المقرر:', '9900002-2', 'مقرر ثان افتراضي'],
            # Oracle can omit repeated column headings on subsequent pages.
            ['9990001', 'طالب افتراضي', '0', 'ح'],
            ['رقم الطالب', 'اسم الطالب', 'المجموع 100%', 'التقدير'],
            ['9990001', 'طالب افتراضي', '0', 'ع'],
        ]
        text = '<o:Created>2026-06-30 12-00-00</o:Created><table>'
        text += ''.join('<tr>' + ''.join('<td>' + v + '</td>' for v in row) + '</tr>' for row in rows)
        return (text + '</table>').encode('cp1256')

    def test_keeps_original_grade_course_period_and_locator_without_other_students(self):
        parsed = extract(self.source(), 'synthetic.xls', {'9990001'})
        a, b, c = parsed['records']
        self.assertEqual(parsed['allResultRows'], 4)
        self.assertEqual(a['period'], '471')
        self.assertEqual(a['courseCode'], '9900001-3')
        self.assertEqual(a['gradeRaw'], 'هـ')
        self.assertEqual(a['courseOutcome'], 'راسب')
        self.assertEqual(a['sourceDate'], '2026-06-30')
        self.assertEqual(a['locator'], 'HTML row 5')
        self.assertEqual(a['totalRaw'], '0')
        self.assertEqual(b['courseCode'], '9900002-2')
        self.assertEqual(b['courseOutcome'], 'محروم')
        self.assertEqual(c['courseOutcome'], 'منقطع')
        self.assertEqual(clean(0), '0')
        self.assertNotIn('status', a)

    def test_normalizes_symbols_without_inventing_failure_from_a_mark(self):
        self.assertEqual(grade_symbol('هـ'), 'ه')
        self.assertEqual(grade_symbol('ﻫ'), 'ه')
        self.assertEqual(grade_symbol('ح'), 'ح')
        self.assertEqual(grade_symbol('أ+'), 'ا+')
        self.assertEqual(period_from_text('للفصل الدراسي الفصل الثاني ١٤٤٧'), '472')
        self.assertEqual(period_from_text('الفصل الصيفي 1446'), '463')
        self.assertEqual(period_from_text('ملف 481.xls'), '')

    def test_requires_number_name_program_degree_and_preserves_ambiguity(self):
        s = {'id': 'synthetic', 'studentNumber': '9990001', 'fullName': 'طالب افتراضي',
             'program': 'الفقه', 'degree': 'ماجستير'}
        register = {'9990001': [s]}
        record = {'studentNumber': '9990001', 'fullName': 'طالب افتراضي', 'courseCode': '9900001-3'}
        codes = {'9900001-3': {('الفقه', 'ماجستير')}}
        self.assertEqual(link_record(record, register, codes)[0], s)
        self.assertIsNone(link_record({**record, 'fullName': 'اسم مختلف'}, register, codes)[0])
        self.assertIsNone(link_record(record, register, {})[0])
        self.assertIsNone(link_record({**record, 'studentNumber': '9990002'}, register, codes)[0])
        other = {**s, 'id': 'other', 'degree': 'دكتوراه'}
        codes['9900001-3'].add(('الفقه', 'دكتوراه'))
        self.assertEqual(link_record(record, {'9990001': [s, other]}, codes)[1], 'ambiguous_enrollment')

    def test_old_course_code_needs_same_period_census_and_cannot_override_a_known_other_program(self):
        s = {'id': 'synthetic', 'studentNumber': '9990001', 'fullName': 'طالب افتراضي',
             'program': 'الفقه', 'degree': 'ماجستير', 'academicSnapshots': [{'period': '471'}]}
        r = {'studentNumber': '9990001', 'fullName': 'طالب افتراضي', 'courseCode': '9900001-3', 'period': '471'}
        self.assertEqual(link_record(r, {'9990001': [s]}, {})[1], 'number_name_same_period_postgraduate_census')
        self.assertIsNone(link_record({**r, 'period': '461'}, {'9990001': [s]}, {})[0])
        self.assertIsNone(link_record(r, {'9990001': [s]}, {'9900001-3': {('برنامج آخر', 'بكالوريوس')}})[0])

    def test_native_workbook_reads_actual_sparse_rows_and_cached_values_without_filling_formatting_dimensions(self):
        content = io.BytesIO()
        ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
        with zipfile.ZipFile(content, 'w') as z:
            z.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="نتائج افتراضية" sheetId="1" r:id="rId1"/></sheets></workbook>')
            z.writestr('xl/_rels/workbook.xml.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>')
            z.writestr('xl/sharedStrings.xml', f'<sst xmlns="{ns}"><si><t>طالب افتراضي</t></si></sst>')
            z.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{ns}"><dimension ref="A1:XFD1048576"/><sheetData><row r="10"><c r="A10"><v>9990001</v></c><c r="B10" t="s"><v>0</v></c><c r="C10"><f>0+0</f><v>0</v></c><c r="E10" t="inlineStr"><is><t>هـ</t></is></c></row><row r="1048576"><c r="XFD1048576" s="1"/></row></sheetData></worksheet>')
        rows = list(read_groups(content.getvalue(), 'synthetic.xlsx'))
        self.assertEqual(rows, [('نتائج افتراضية', 10, ['9990001', 'طالب افتراضي', '0', '', 'هـ'])])

    def test_missing_or_numeric_grade_does_not_contradict_a_reported_symbol(self):
        partial = outcome_differences([{'gradeCode': '', 'totalRaw': '0'}, {'gradeCode': 'ا+', 'totalRaw': '100'}])
        self.assertFalse(partial['conflictingOutcomes'])
        self.assertTrue(partial['missingGradeInSomeSources'])
        self.assertFalse(outcome_differences([{'gradeCode': '50'}, {'gradeCode': 'ا+'}])['conflictingOutcomes'])
        self.assertTrue(outcome_differences([{'gradeCode': 'ح'}, {'gradeCode': 'ا+'}])['conflictingOutcomes'])

    def test_changed_source_does_not_reuse_a_stale_probe(self):
        with tempfile.TemporaryDirectory() as d:
            p = pathlib.Path(d) / 'synthetic.xls'
            p.write_bytes(self.source())
            cached = probe(str(p))
            self.assertTrue(cached['resultHeaderCandidate'])
            self.assertTrue(probe_is_current(cached, p))
            p.write_bytes(self.source() + b'\n')
            self.assertFalse(probe_is_current(cached, p))


if __name__ == '__main__':
    unittest.main()
