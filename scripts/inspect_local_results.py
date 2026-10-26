"""Find local course-result sources and audit links to an existing graduate register.

Read-only toward sources and browser data. Outputs must live under private-data.
Course outcomes never change enrollment status. Names are corroboration, not keys.
"""
from __future__ import annotations

import argparse
import collections
import csv
import datetime as dt
import hashlib
import html
import io
import json
import pathlib
import posixpath
import re
import sys
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor

from harvest_graduates import degree, key, namekey, norm, program

TR = re.compile(r"<tr\b[^>]*>(.*?)</tr>", re.I | re.S)
CELL = re.compile(r"<t[dh]\b[^>]*>(.*?)</t[dh]>", re.I | re.S)
TAGS = re.compile(r"<[^>]*>")
COURSE = re.compile(r"(?<!\d)(\d{6,9})\s*[-–]\s*(\d{1,2})(?!\d)")
DERIVED = re.compile(
    r"/(?:jobs|work|generated_candidates|qa-results|qa-local|node_modules|tests?|"
    r"site-packages|fixtures|report-worker|course-\d+|rendered[^/]*|\.git|\.venv)/"
    r"|/مهام الدراسات العليا/|/\.codex/", re.I,
)
SYMBOLS = {"ع": "منقطع", "ح": "محروم", "ه": "راسب"}


def clean(value):
    if isinstance(value, (dt.date, dt.datetime)):
        return value.isoformat()
    return re.sub(r"\s+", " ", html.unescape(TAGS.sub(" ", str("" if value is None else value)))).strip()


def grade_symbol(value):
    """Normalize presentation forms/tatweel only; never infer from a mark or GPA."""
    return re.sub(r"\s+", "", norm(value))


def outcome_differences(observations):
    codes = {r["gradeCode"] for r in observations}
    numeric = {c for c in codes if c and re.fullmatch(r"[0-9.,% -]+", c)}
    nonempty_symbols = codes - numeric - {""}
    fields = {(r["gradeCode"], r.get("totalRaw", "")) for r in observations}
    return {"conflictingOutcomes": len(nonempty_symbols) > 1,
            "sourceFieldDifferences": len(fields) > 1,
            "missingGradeInSomeSources": "" in codes and bool(nonempty_symbols),
            "numericGradeInSomeSources": bool(numeric)}


def period_from_text(text):
    text = norm(text)
    m = re.search(r"الفصل\s*(?:الدراسي\s*)?(الاول|الثاني|الصيفي|الثالث)\s*(14\d{2})", text)
    if not m:
        m = re.search(r"(14\d{2})\s*.*?الفصل\s*(?:الدراسي\s*)?(الاول|الثاني|الصيفي|الثالث)", text)
        if not m:
            return ""
        year, term = m.groups()
    else:
        term, year = m.groups()
    return year[-2:] + {"الاول": "1", "الثاني": "2", "الصيفي": "3", "الثالث": "3"}[term]


def html_rows(text):
    for i, match in enumerate(TR.finditer(text), 1):
        yield "HTML", i, [clean(v) for v in CELL.findall(match[1])]


def read_groups(data, filename):
    if data.startswith(b"PK"):
        # Read populated OOXML cells directly. Quality templates often format
        # thousands of empty rows on every tab; those are not student records.
        ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
        with zipfile.ZipFile(io.BytesIO(data)) as book:
            strings = []
            if "xl/sharedStrings.xml" in book.namelist():
                with book.open("xl/sharedStrings.xml") as handle:
                    for _, element in ET.iterparse(handle, events=("end",)):
                        if element.tag == ns + "si":
                            strings.append("".join(t.text or "" for t in element.iter(ns + "t")))
                            element.clear()
            relationships = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
            targets = {r.attrib["Id"]: r.attrib["Target"] for r in relationships}
            workbook = ET.fromstring(book.read("xl/workbook.xml"))
            rel_ns = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"
            for sheet in workbook.findall(".//" + ns + "sheet"):
                target = targets[sheet.attrib[rel_ns]]
                target = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
                if not target.startswith("xl/worksheets/"):
                    continue
                with book.open(target) as handle:
                    for _, element in ET.iterparse(handle, events=("end",)):
                        if element.tag != ns + "row":
                            continue
                        values = {}
                        for cell in element.findall(ns + "c"):
                            value = cell.find(ns + "v")
                            raw = value.text if value is not None else None
                            if cell.attrib.get("t") == "s" and raw is not None:
                                raw = strings[int(raw)]
                            elif cell.attrib.get("t") == "inlineStr":
                                raw = "".join(t.text or "" for t in cell.iter(ns + "t"))
                            if raw is None or raw == "":
                                continue
                            column = re.match(r"([A-Z]+)", cell.attrib["r"])[1]
                            index = 0
                            for char in column:
                                index = index * 26 + ord(char) - 64
                            values[index - 1] = clean(raw)
                        if values:
                            yield sheet.attrib["name"], int(element.attrib["r"]), [values.get(i, "") for i in range(max(values) + 1)]
                        element.clear()
    elif data[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
        import xlrd
        book = xlrd.open_workbook(file_contents=data)
        for sheet in book.sheets():
            for i in range(sheet.nrows):
                yield sheet.name, i + 1, [clean(sheet.cell_value(i, j)) for j in range(sheet.ncols)]
    elif filename.lower().endswith(".csv"):
        text = decode(data)
        try:
            dialect = csv.Sniffer().sniff(text[:10000], delimiters=",;\t")
        except csv.Error:
            dialect = csv.excel
        for i, row in enumerate(csv.reader(io.StringIO(text), dialect), 1):
            yield "CSV", i, [clean(v) for v in row]
    else:
        yield from html_rows(decode(data))


def decode(data):
    for enc in ("utf-8-sig", "cp1256", "utf-16"):
        try:
            return data.decode(enc)
        except UnicodeError:
            pass
    return data.decode("cp1256", errors="replace")


def header_mapping(cells):
    aliases = {
        "studentNumber": ["رقم الطالب", "الرقم الجامعي", "الرقم_الجامعي", "Student ID"],
        "fullName": ["اسم الطالب", "الاسم", "Student Name"],
        "gradeRaw": ["التقدير", "التقدير النهائي", "الرمز", "Grade"],
        "courseCode": ["رمز المقرر", "رقم المقرر", "Course Code"],
        "courseTitle": ["اسم المقرر", "المقرر", "Course Name"],
        "periodRaw": ["الفصل", "الفصل الدراسي", "الفصل_الدراسي", "Semester"],
        "programRaw": ["البرنامج", "التخصص", "اسم البرنامج"],
        "degreeRaw": ["الدرجة العلمية", "الدرجة"],
        "section": ["الشعبة", "رقم الشعبة", "Section"],
    }
    indices = {norm(v): i for i, v in enumerate(cells)}
    mapping = {}
    for field, names in aliases.items():
        found = [indices[norm(n)] for n in names if norm(n) in indices]
        if found:
            mapping[field] = found[0]
    for i, value in enumerate(cells):
        if norm(value).startswith("المجموع"):
            mapping["totalRaw"] = i
    return mapping if {"studentNumber", "gradeRaw"} <= mapping.keys() else {}


def extract(data, filename, wanted_numbers):
    """Extract only numbered rows of interest, retaining report/row context."""
    text_head = decode(data[:262144]) if not data.startswith(b"PK") else ""
    created = re.search(r"<o:Created>(\d{4}-\d{2}-\d{2})[^<]*</o:Created>", text_head, re.I)
    source_date = created[1] if created else ""
    records, headers, periods, mappings = [], 0, set(), {}
    context = {"period": "", "courseCode": "", "courseTitle": "", "section": "", "activity": ""}
    last_sheet = None
    all_rows = 0
    for sheet, row_number, cells in read_groups(data, filename):
        if sheet != last_sheet:
            mappings = {}
            context = {k: "" for k in context}
            last_sheet = sheet
        # University-wide reports can contain tens of thousands of unrelated
        # undergraduate rows. Count them, but do not repeatedly inspect their
        # names/marks as if they were report headings.
        if mappings and mappings["studentNumber"] < len(cells):
            possible_number = norm(cells[mappings["studentNumber"]]).removesuffix(".0")
            if re.fullmatch(r"\d{7,9}", possible_number) and possible_number not in wanted_numbers:
                all_rows += 1
                continue
        heading = " ".join(cells)
        period = period_from_text(heading)
        if period:
            context["period"] = period
            periods.add(period)
        proposed = header_mapping(cells)
        if proposed:
            mappings = proposed
            headers += 1
            continue
        # Oracle prints its column headings only once in some exports. Repeated
        # course/page headings therefore keep the source's numbered-row layout.
        for j, value in enumerate(cells):
            if norm(value).rstrip(":") == "المقرر":
                after = [(i, v) for i, v in enumerate(cells[j + 1:], j + 1) if v]
                code = next(((i, COURSE.search(norm(v))) for i, v in after if COURSE.search(norm(v))), None)
                if code:
                    idx, m = code
                    context["courseCode"] = m[1] + "-" + m[2]
                    rest = [v for v in cells[idx + 1:] if v]
                    context["courseTitle"] = rest[0] if rest else ""
            if norm(value).rstrip(":") in ["شعبة", "نشاط"]:
                following = next((v for v in cells[j + 1:] if v), "")
                context["section" if norm(value).startswith("شعب") else "activity"] = following
        if not mappings:
            continue
        get = lambda k: cells[mappings[k]] if k in mappings and mappings[k] < len(cells) else ""
        number = norm(get("studentNumber")).removesuffix(".0")
        if not re.fullmatch(r"\d{7,9}", number):
            continue
        all_rows += 1
        if number not in wanted_numbers:
            continue
        record = {k: get(k) for k in mappings}
        record.update(context)
        if sheet == "HTML" and context["courseCode"]:
            # Assessment components vary by course. In Oracle reports the last
            # populated cell is the grade (or the total when no grade is set).
            # Locate it from the row, rather than reusing the first course's
            # assessment-column count for every subsequent course.
            tail = [(i, v) for i, v in enumerate(cells) if i > mappings.get("fullName", mappings["studentNumber"]) and v]
            if tail:
                last_index, last_value = tail[-1]
                if re.fullmatch(r"[\d.,% -]+", norm(last_value)):
                    record["gradeRaw"] = ""
                    record["totalRaw"] = last_value
                else:
                    record["gradeRaw"] = last_value
                    record["totalRaw"] = tail[-2][1] if len(tail) > 1 else ""
        # In a flat export the row's explicit fields take precedence.
        for k in ["courseCode", "courseTitle", "section"]:
            if get(k):
                record[k] = get(k)
        explicit_period = norm(get("periodRaw"))
        if re.fullmatch(r"\d{3}", explicit_period):
            record["period"] = explicit_period
            periods.add(explicit_period)
        elif period_from_text(explicit_period):
            record["period"] = period_from_text(explicit_period)
        record.update(studentNumber=number, sourceDate=source_date,
                      locator=f"{sheet} row {row_number}", gradeCode=grade_symbol(record.get("gradeRaw", "")))
        record["courseOutcome"] = SYMBOLS.get(record["gradeCode"], "تقدير آخر" if record.get("gradeRaw") else "بلا تقدير")
        records.append(record)
    return {"records": records, "sourceDate": source_date, "reportHeaders": headers,
            "sourcePeriods": sorted(periods), "allResultRows": all_rows}


def probe(path):
    """Probe every selected source; filename alone never establishes its contents."""
    try:
        p = pathlib.Path(path)
        stat = p.stat()
        fingerprint = {"mtimeNs": stat.st_mtime_ns, "fileFlags": getattr(stat, "st_flags", 0)}
        # macOS File Provider placeholders can block an open indefinitely when
        # the provider is unavailable. Inventory these explicitly; never count
        # their unread contents as searched. Hydrated duplicates remain usable.
        if getattr(stat, "st_flags", 0) & 0x40000000:
            return {"path": path, "bytes": stat.st_size, **fingerprint, "availability": "cloud_placeholder",
                    "error": "File Provider content is not downloaded locally"}
        with p.open("rb") as handle:
            head = handle.read(262144)
        suffix = p.suffix.lower()
        if head.startswith(b"PK"):
            fragments = []
            with zipfile.ZipFile(p) as z:
                if "xl/sharedStrings.xml" in z.namelist():
                    with z.open("xl/sharedStrings.xml") as s:
                        fragments.append(s.read(2097152).decode("utf-8", errors="replace"))
                for name in [n for n in z.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)][:8]:
                    with z.open(name) as s:
                        fragments.append(s.read(131072).decode("utf-8", errors="replace"))
            text = norm(" ".join(fragments))
            is_result = any(norm(x) in text for x in ["رقم الطالب", "الرقم الجامعي", "الرقم_الجامعي", "Student ID"]) and any(norm(x) in text for x in ["التقدير", "التقدير النهائي", "Grade"])
            kind = "xlsx"
        elif head[:8] == b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1":
            # BIFF stores strings in UTF-16, so retain all binary workbooks.
            is_result, kind = True, "biff"
        else:
            text = norm(clean(decode(head)))
            is_result = any(norm(x) in text for x in ["رقم الطالب", "الرقم الجامعي", "الرقم_الجامعي", "Student ID"]) and any(norm(x) in text for x in ["التقدير", "Grade"])
            kind = "csv" if suffix == ".csv" else "html"
        result = {"path": path, "bytes": stat.st_size, **fingerprint, "kind": kind, "resultHeaderCandidate": is_result}
        if is_result:
            sha = hashlib.sha256()
            with p.open("rb") as f:
                for chunk in iter(lambda: f.read(1048576), b""):
                    sha.update(chunk)
            result["sha256"] = sha.hexdigest()
        return result
    except Exception as e:
        return {"path": path, "error": f"{type(e).__name__}: {e}"}


def probe_is_current(cached, path):
    try:
        stat = pathlib.Path(path).stat()
        return (cached.get("mtimeNs") == stat.st_mtime_ns and cached.get("bytes") == stat.st_size
                and cached.get("fileFlags") == getattr(stat, "st_flags", 0))
    except OSError:
        return False


def plan_index(data):
    codes = collections.defaultdict(set)
    levels = collections.defaultdict(set)
    for p in data["programs"]:
        deg = degree(p.get("degree"))
        if not deg:
            if p.get("degree") == "بكالوريوس":
                for c in p.get("courses", []):
                    codes[norm(c["code"])].add((p["name"], "بكالوريوس"))
            continue
        prog = program(p["name"], deg)
        for c in p.get("courses", []):
            code = norm(c["code"])
            codes[code].add((prog, deg))
            if c.get("level") is not None:
                levels[(code, prog, deg)].add(c["level"])
    return codes, levels


def link_record(record, register, codes):
    candidates = register.get(record["studentNumber"], [])
    matched = [s for s in candidates if record.get("fullName") and namekey(record["fullName"]) == namekey(s["fullName"])]
    if not matched:
        return None, "number_name_conflict_or_name_missing"
    code = norm(record["courseCode"])
    membership = codes.get(code, set())
    explicit_degree = degree(record.get("degreeRaw"))
    explicit_program = program(record.get("programRaw", ""), explicit_degree) if explicit_degree else ""
    confirmed = [s for s in matched if (s["program"], s["degree"]) in membership
                 or (explicit_degree == s["degree"] and explicit_program == s["program"])]
    if len(confirmed) == 1:
        return confirmed[0], "number_name_program_degree"
    # A current plan is not an exhaustive dictionary of historical codes.
    # An official graduate census for the exact same period can establish the
    # enrollment when number and full name agree. Do not relabel the old course
    # as a current-plan equivalent or assign a plan level by title similarity.
    if len(matched) == 1 and code and not membership and not record.get("degreeRaw"):
        s = matched[0]
        if any(x["period"] == record.get("period") for x in s.get("academicSnapshots", [])):
            return s, "number_name_same_period_postgraduate_census"
    return None, "ambiguous_enrollment" if len(confirmed) > 1 else "course_program_degree_unverified"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inventory", required=True, type=pathlib.Path)
    ap.add_argument("--baseline", required=True, type=pathlib.Path)
    ap.add_argument("--plans", required=True, type=pathlib.Path)
    ap.add_argument("--output", required=True, type=pathlib.Path)
    args = ap.parse_args()
    root = args.output.resolve()
    if "private-data" not in root.parts:
        raise SystemExit("Outputs contain private student records; use private-data.")
    root.mkdir(parents=True, exist_ok=True)
    if (root / "python-deps").is_dir():
        sys.path.insert(0, str(root / "python-deps"))
    save = lambda name, value: (root / name).write_text(json.dumps(value, ensure_ascii=False, indent=2))
    baseline = json.loads(args.baseline.read_text())
    register = collections.defaultdict(list)
    for s in baseline["students"]:
        register[s["studentNumber"]].append(s)
    codes, levels = plan_index(json.loads(args.plans.read_text()))
    paths = args.inventory.read_text().splitlines()
    selected, excluded = [], []
    suffixes = {".xls", ".xlsx", ".xlsm", ".csv", ".htm", ".html"}
    for p in paths:
        if pathlib.Path(p).suffix.lower() not in suffixes or pathlib.Path(p).name.startswith("~$"):
            continue
        if DERIVED.search(p) and not pathlib.Path(p).is_relative_to(root / "archive-sources"):
            excluded.append(p)
        else:
            selected.append(p)
    # Resume the expensive, read-only probing phase after a parser repair.
    probe_file = root / "source-probes.json"
    if probe_file.exists():
        old = json.loads(probe_file.read_text())
        lookup = {p["path"]: p for p in old}
    else:
        lookup = {}
    pending = [p for p in selected if p not in lookup or not probe_is_current(lookup[p], p)]
    print(json.dumps({"inventoryPaths": len(paths), "selected": len(selected), "cachedProbes": len(lookup), "pendingProbes": len(pending)}), flush=True)
    with ThreadPoolExecutor(max_workers=4) as pool:
        for i, result in enumerate(pool.map(probe, pending), 1):
            lookup[result["path"]] = result
            if i % 250 == 0:
                save("source-probes.json", list(lookup.values()))
                print(json.dumps({"probed": i, "total": len(pending)}), flush=True)
    probes = [lookup[p] for p in selected]
    save("source-probes.json", probes)
    save("excluded-generated-paths.json", excluded)
    groups = collections.defaultdict(list)
    for p in probes:
        if p.get("sha256"):
            groups[p["sha256"]].append(p)
    print(json.dumps({"resultCandidatePaths": sum(len(g) for g in groups.values()), "uniqueCandidateContents": len(groups)}), flush=True)
    records, issues, manifests = [], [], []
    number_set_hash = hashlib.sha256("|".join(sorted(register)).encode()).hexdigest()[:16]
    for i, (sha, aliases) in enumerate(groups.items(), 1):
        source = pathlib.Path(aliases[0]["path"])
        try:
            parser_suffix = "-xml1" if aliases[0]["kind"] == "xlsx" else ""
            cache = root / "parsed-sources-v2" / (sha + "-" + number_set_hash + parser_suffix + ".json")
            if cache.exists():
                parsed = json.loads(cache.read_text())
            else:
                parsed = extract(source.read_bytes(), source.name, set(register))
                cache.parent.mkdir(exist_ok=True)
                cache.write_text(json.dumps(parsed, ensure_ascii=False))
        except Exception as e:
            issues.append({"kind": "parse_error", "sha256": sha, "path": str(source), "error": f"{type(e).__name__}: {e}"})
            continue
        manifest = {k: v for k, v in parsed.items() if k != "records"}
        manifest.update(id="local-result:" + sha, sha256=sha, aliases=aliases, matchedNumberRows=len(parsed["records"]))
        manifests.append(manifest)
        for r in parsed["records"]:
            s, basis = link_record(r, register, codes)
            r.update(sourceId=manifest["id"], sourcePath=str(source), linkBasis=basis)
            if s:
                r.update(studentId=s["id"], program=s["program"], degree=s["degree"],
                         enrollmentKey=key(s["studentNumber"], s["program"], s["degree"]),
                         planLevels=sorted(levels.get((norm(r["courseCode"]), s["program"], s["degree"]), set())))
                r["enrollmentEvidenceIds"] = sorted({e for x in s.get("academicSnapshots", [])
                                                       if x["period"] == r["period"] for e in x["evidenceIds"]})
                records.append(r)
            else:
                issues.append({"kind": basis, "record": r})
        if i % 10 == 0:
            print(json.dumps({"parsedContents": i, "total": len(groups), "linkedObservations": len(records), "reviewItems": len(issues)}), flush=True)
            save("result-observations.json", {"observations": records})
            save("source-manifest.json", {"sources": manifests})
            save("review-items.json", {"items": issues})
    save("result-observations.json", {"observations": records})
    save("source-manifest.json", {"sources": manifests})
    save("review-items.json", {"items": issues})
    # A logical course result is distinct from observations of the same result.
    events = collections.defaultdict(list)
    for r in records:
        identity = (r["studentId"], r["period"], norm(r["courseCode"]), norm(r["activity"]), r["section"])
        events[identity].append(r)
    logical, conflicts = [], []
    for identity, observations in events.items():
        event = {"studentId": identity[0], "period": identity[1], "courseCode": identity[2],
                 "activity": identity[3], "section": identity[4], "observations": observations,
                 **outcome_differences(observations)}
        logical.append(event)
        if event["conflictingOutcomes"]:
            conflicts.append(event)
    save("course-results.json", {"results": logical, "conflicts": conflicts})
    flagged = {r["studentId"] for r in records if r["gradeCode"] in SYMBOLS}
    current = {s["id"] for s in baseline["students"] if any(x["period"] == "481" and x["status"] == "منتظم" for x in s.get("academicSnapshots", []))}
    summary = {"searchedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
               "inventoryPaths": len(paths), "probedPaths": len(probes), "excludedGeneratedPaths": len(excluded),
               "probeErrors": [p for p in probes if p.get("error")],
               "candidateResultPaths": sum(len(g) for g in groups.values()), "uniqueParsedContents": len(manifests),
               "resultReportContents": sum(m["reportHeaders"] > 0 for m in manifests),
               "linkedObservations": len(records), "logicalCourseResults": len(logical),
               "linkedStudents": len({r["studentId"] for r in records}),
               "sourcePeriods": sorted({r["period"] for r in records if r["period"]}),
               "symbols": {symbol: {"meaningAsProvidedByUser": meaning,
                            "observations": sum(r["gradeCode"] == symbol for r in records),
                            "students": len({r["studentId"] for r in records if r["gradeCode"] == symbol}),
                            "current481RegularStudentsWithHistoricalSymbol": len(current & {r["studentId"] for r in records if r["gradeCode"] == symbol})}
                           for symbol, meaning in SYMBOLS.items()},
               "studentsWithAnyFlag": len(flagged), "current481RegularStudentsWithAnyHistoricalFlag": len(current & flagged),
               "current481RegularStudentsWithAnyResults": len(current & {r["studentId"] for r in records}),
               "conflictingLogicalResults": len(conflicts), "reviewItems": len(issues),
               "logicalResultsWithSourceFieldDifferences": sum(e["sourceFieldDifferences"] for e in logical),
               "logicalResultsWithPartialGradeSources": sum(e["missingGradeInSomeSources"] for e in logical),
               "reviewReasons": dict(collections.Counter(x["kind"] for x in issues)),
               "baselineSHA256": hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
               "plansSHA256": hashlib.sha256(args.plans.read_bytes()).hexdigest(),
               "limitations": ["Course outcomes are historical, not current enrollment status.",
                   "No browser data or source workbook was modified.",
                   "Unverified course-program-degree links and name conflicts remain in review.",
                   "Generated work/test directories were inventoried but not treated as original sources.",
                   "Conflicting outcomes are preserved; no automatic replacement."]}
    save("summary.json", summary)
    print(json.dumps({k: v for k, v in summary.items() if k not in ["probeErrors"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
