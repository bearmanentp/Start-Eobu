"""Refresh public feeds independently and retain cached records on network errors."""
import hashlib
import html
import json
import os
import re
from datetime import date
from pathlib import Path
from urllib.parse import urlencode, urljoin, urlsplit
from urllib.request import Request, urlopen

DATA = Path(__file__).resolve().parents[1] / "public/data"


def fetch(url, **params):
    request = Request(url + "?" + urlencode(params), headers={"User-Agent": "Start-Eobu/1.0"})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def clean(value):
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", str(value or ""))).split())


def source(feed, title, body, url, grant=False, eligibility="", deadline=""):
    title, body = clean(title), clean(body)
    if not title:
        raise ValueError("empty title")
    if urlsplit(url).scheme not in ("http", "https"):
        raise ValueError("unsupported source URL")
    category = next((v for v in ["예비창업", "초기창업"] if v in title + eligibility), "지원사업")
    if any(v in title for v in ("바우처", "기술개발", "R&D")):
        category = "R&D·바우처"
    return dict(id=feed + "-" + hashlib.sha256((url + title).encode()).hexdigest()[:14],
                title=title, kind="grant" if grant else "trend", org=feed,
                category=category if grant else "글로벌 트렌드", url=url,
                summary=(body or title)[:420], eligibility=clean(eligibility), deadline=deadline,
                action="공식 공고의 신청 서류를 확인하세요." if grant else "원문에서 사용자 반응과 적용 사례를 확인하세요.")


def deadline(value):
    matches = re.findall(r"(20\d{2})[-.]?(\d{2})[-.]?(\d{2})", str(value or ""))
    try:
        return date(*map(int, matches[-1])).isoformat()
    except (IndexError, ValueError):
        return ""


def hn():
    hits = fetch("https://hn.algolia.com/api/v1/search", query="startup", tags="story", hitsPerPage=8)["hits"]
    return [source("Hacker News", h["title"], f"{h['points']}점 · 댓글 {h['num_comments'] or 0}개. " + h["title"],
                   "https://news.ycombinator.com/item?id=" + h["objectID"]) for h in hits]


def github():
    rows = fetch("https://api.github.com/search/repositories", q="topic:ai-agents stars:>100", sort="updated", per_page=8)["items"]
    return [source("GitHub", h["full_name"], h["description"], h["html_url"]) for h in rows]


def kstartup():
    rows = fetch("https://apis.data.go.kr/B552735/kisedKstartupService01/getAnnouncementInformation01",
                 serviceKey=os.environ["KSTARTUP_API_KEY"], returnType="json", page=1, perPage=20)["data"]
    return [source("K-Startup", h["biz_pbanc_nm"], h.get("pbanc_ctnt"), h.get("detl_pg_url") or "https://www.k-startup.go.kr/", True,
                   h.get("aply_trgt_ctnt") or "", deadline(h.get("pbanc_rcpt_end_dt"))) for h in rows]


def bizinfo():
    rows = fetch("https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do", crtfcKey=os.environ["BIZINFO_API_KEY"],
                 dataType="json", searchCnt=20)["jsonArray"]
    return [source("기업마당", h["pblancNm"], h.get("bsnsSumryCn"), urljoin("https://www.bizinfo.go.kr", h["pblancUrl"]),
                   True, h.get("trgetNm") or "", deadline(h.get("reqstBeginEndDe"))) for h in rows]


def update(name, feeds):
    path = DATA / (name + ".json")
    records = json.loads(path.read_text(encoding="utf-8"))
    for feed, loader in feeds:
        try:
            rows = loader()
            records = [r for r in records if r.get("sample") or r["org"] != feed] + rows
            print(feed, len(rows))
        except Exception as error:
            # HTTP exceptions can include API keys in URLs.
            print(feed, "refresh unavailable:", type(error).__name__)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


if __name__ == "__main__":
    update("trends", [("Hacker News", hn), ("GitHub", github)])
    update("grants", [(name, load) for key, name, load in [
        ("KSTARTUP_API_KEY", "K-Startup", kstartup), ("BIZINFO_API_KEY", "기업마당", bizinfo)] if os.getenv(key)])

