#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
影视仓 / 电视盒子 资源推送链接检测器
======================================
功能：每次运行自动：
  1. 从内置候选源 + 动态多仓（聚合仓）+ GitHub 他人整理的接口仓库中收集最新链接；
  2. 逐个用网络请求探测可用性（HTTP 状态、响应内容是否为有效配置/列表）；
  3. 只输出“探测通过”的链接，并同时保存到文本文件，方便复制到影视仓配置地址。

当前内置来源：
  * 无邪多仓/优选仓/聚合仓（每日更新，自动展开子线路）
  * 月光宝盒多仓、liucn 自用多仓
  * 影视仓 YSC、HG 影视、聚玩盒子 4K、动漫专线等单仓
  * 游魂、IPTV 直播源
  * GitHub 收录：wuxierj/TVBox（README 接口大全，自动抓取并提取链接）
  * GitHub 收录：qist/tvbox（OK影视配置库，自动枚举仓库内全部配置文件）

特点：
  * 仅使用 Python 标准库，无需 pip 安装任何第三方依赖；
  * 支持中文域名（自动转 punycode）；
  * 自动展开“多仓/聚合仓”配置，发现其中最新的子链接；
  * GitHub 托管源失败时自动走 gh-proxy 镜像重试一次；
  * 多线程并发探测，速度快；
  * 跨平台：Windows / macOS / Linux / Android(Termux)。

用法：
  python 影视仓链接检测.py
  可选参数：
    --timeout 10        单个链接超时秒数（默认 10）
    --workers 12        并发线程数（默认 12）
    --out 文件名        输出文本文件名
    --extra URL         额外追加一个要检测的链接（可多次使用）
    --no-dynamic        不展开多仓/不抓 GitHub，只检测内置列表

说明：
  “可用”= 链接可访问、返回内容为有效的影视仓配置（JSON）或直播列表；
  接口内某个具体片源能否播放，取决于对方站点，脚本无法逐条保证。
"""

import argparse
import datetime
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.parse import quote, urlparse

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# ---------------------------------------------------------------- 内置候选源
# (名称, 链接)。其中带“多仓/聚合”字样的会自动展开内部子链接。
SEED_LINKS = [
    # —— 聚合仓（每日更新，自动展开子链接）——
    ("无邪多仓(聚合全网, 官方源)", "https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/wx.json"),
    ("无邪多仓(gh-proxy镜像)", "https://gh-proxy.com/https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/wx.json"),
    ("无邪优选仓", "https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/yx.txt"),
    ("无邪聚合仓", "https://raw.githubusercontent.com/wxrjck/-YSC-/refs/heads/main/jh.txt"),
    ("月光宝盒多仓", "https://jihulab.com/ygbh1/box/raw/main/dcang/dc.json"),
    ("自用多仓(liucn)", "https://raw.liucn.cc/box/dm.txt"),
    # —— 影视配置（单仓）——
    ("影视仓YSC配置", "https://jihulab.com/mengzhu2/ysc/raw/main/YSC.json"),
    ("HG影视配置", "https://api.hgyx.vip/hgyx.json"),
    ("聚玩盒子4K", "http://xhztv.top/4k.json"),
    ("动漫专线", "https://www.yingm.cc/dm/dm.json"),
    # —— 直播源 ——
    ("游魂直播源", "https://www.iyouhun.com/tv/zb"),
    ("IPTV直播源(500+台)", "https://live.zbds.top/tv/iptv4.txt"),
    # —— 社区线路（国内网络较稳，有防爬的可能需浏览器确认）——
    ("饭太硬线路", "http://www.饭太硬.net/tv"),
    ("饭太硬备用", "http://fty.888484.xyz/tv"),
    ("王二小线路", "http://tvbox.王二小放牛娃.top"),
    ("王二小备用", "https://9280.kstore.vip/newwex.json"),
    ("短剧专线", "http://box.ufuzi.com/tv/qq/短剧频道/api.json"),
    ("儿童专线", "https://jihulab.com/ymz1231/xymz/raw/main/ymshaoer"),
]

# ------------------------------------------------- GitHub 他人整理的接口来源
# 1) Markdown 形式的“接口大全”仓库：抓取 README，正则提取其中全部 http(s) 链接
GITHUB_MD_SOURCES = [
    ("GitHub·wuxierj/TVBox接口大全", "https://raw.githubusercontent.com/wuxierj/TVBox/main/README.md"),
]

# 2) 配置/列表文件仓库：先用 GitHub API 递归枚举仓库内全部 .json/.txt/.m3u 文件，
#    再逐个探测；API 不可用时回退到内置文件清单。
GITHUB_REPO_SOURCES = [
    {
        "name": "GitHub·qist/tvbox配置库",
        "short": "qist",
        "api": "https://api.github.com/repos/qist/tvbox/git/trees/master?recursive=1",
        "raw_base": "https://raw.githubusercontent.com/qist/tvbox/master/",
        "exts": (".json", ".txt", ".m3u"),
        "exclude_dirs": ("jar/", "lib/", "py/", "tools/", ".github/", "biliext/", "assets/"),
        "max_files": 80,
        "fallback_files": [
            "367.json", "js.json", "jsm.json", "dianshi.json", "fty.json", "XYQ.json",
            "0821.json", "0825.json", "0826.json", "0827.json", "9918.json", "99188.json",
            "list.txt", "tvboxtv.txt", "tvlive.txt", "ITV.txt", "zb.txt", "radio.txt",
            "yo21.txt", "listx.m3u", "livex.m3u", "list.m3u", "radio.m3u",
        ],
    },
]

# 多仓 JSON 中承载子链接的字段（常见命名）
STOREHOUSE_KEYS = ("storeHouse", "urls", "storehouse")
SUB_URL_KEYS = ("url", "sourceUrl", "src", "api")
URL_PATTERN = re.compile(r"https?://[^\s\"'<>)\]]+")

GH_PROXY_MIRROR = "https://gh-proxy.com/"


def to_idn(url: str) -> str:
    """中文域名 -> punycode，中文路径 -> 百分号转义，方便 urllib 请求。"""
    m = re.match(r"^(https?://)([^/]+)(/.*)?$", url, re.I)
    if not m:
        return url
    scheme, host, rest = m.group(1), m.group(2), m.group(3) or ""
    try:
        host = host.encode("idna").decode("ascii")
    except Exception:
        pass
    rest = quote(rest, safe="/%:@?&=+~,.-_!'()*[]")
    return scheme + host + rest


def fetch(url: str, timeout: float):
    """GET 请求，返回 (最终URL, 状态码, 响应头, 字节体, 耗时)。失败返回 (None, None, {}, b'', 耗时)。"""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    req = urllib.request.Request(to_idn(url), headers={"User-Agent": UA, "Accept": "*/*"})
    t0 = time.perf_counter()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=ctx) as r:
            body = r.read(2 * 1024 * 1024)          # 最多读 2MB 用于校验
            return r.geturl(), r.status, dict(r.headers), body, time.perf_counter() - t0
    except urllib.error.HTTPError as e:
        return None, e.code, {}, b"", time.perf_counter() - t0
    except Exception:
        return None, None, {}, b"", time.perf_counter() - t0


def escape_raw_controls(text: str) -> str:
    """把 JSON 字符串内部的裸换行/回车/制表符转义为合法形式（容忍源站不规范配置）。"""
    out = []
    in_str = False
    esc = False
    for ch in text:
        if in_str:
            if esc:
                out.append(ch)
                esc = False
                continue
            if ch == "\\":
                out.append(ch)
                esc = True
                continue
            if ch == '"':
                in_str = False
            elif ch == "\n":
                out.append("\\n")
                continue
            elif ch == "\r":
                out.append("\\r")
                continue
            elif ch == "\t":
                out.append("\\t")
                continue
            out.append(ch)
        else:
            if ch == '"':
                in_str = True
            out.append(ch)
    return "".join(out)


def lenient_json_loads(text: str):
    """宽容解析民间配置：去 // 与 # 注释行、去尾逗号、转义字符串内裸控制符。"""
    lines = [ln for ln in text.splitlines() if not re.match(r"^\s*(//|#)", ln)]
    cleaned = "\n".join(lines).strip()
    cleaned = re.sub(r",\s*([}\]])", r"\1", cleaned)   # 去掉数组/对象结尾的多余逗号
    cleaned = escape_raw_controls(cleaned)
    return json.loads(cleaned)


def classify(body: bytes, url: str):
    """
    对响应体做内容级校验。
    返回 (是否可用, 类型, 说明)
      is_ok=True  -> 链接可作为影视仓配置/列表使用
      类型: 多仓 / 影视配置 / 直播列表 / JSON配置
    """
    text = body.decode("utf-8", "ignore").lstrip("\ufeff")
    stripped = text.lstrip()

    # 1) 防反爬：返回 HTML 页面视为不可用（可能是 JS 挑战页/风控页）
    if re.search(r"<!doctype html|<html|<head", stripped[:200], re.I):
        return False, "HTML页面", "站点有防爬/需浏览器访问"

    # 2) JSON 类：链接以 .json 结尾，或去掉注释后内容以 { 开头
    obj = None
    try:
        obj = lenient_json_loads(text[:4096])
    except Exception:
        try:
            obj = lenient_json_loads(text)
        except Exception:
            obj = None
    if obj is not None:
        if isinstance(obj, dict):
            keys = {k.lower() for k in obj.keys()}
            if keys & {"storehouse", "urls"}:
                return True, "多仓", "含子线路，可展开"
            if keys & {"sites", "spiders", "lives", "parses"}:
                return True, "影视配置", "单仓影视接口"
            return True, "JSON配置", "通用 JSON 配置"
        return False, "JSON类型不符", "JSON 根节点不是对象"

    # 3) 文本列表类：直播源 / m3u 列表 / 纯文本配置
    if stripped.startswith("{"):
        return False, "JSON解析失败", "内容不是有效 JSON"
    if len(body) >= 200:
        return True, "直播列表", "文本播放列表"
    return False, "内容过小", f"仅 {len(body)} 字节，疑似无效"


def expand_multi(body: bytes, base_url: str):
    """如果响应是“多仓”，解析其中的子链接。返回 [(名称, 链接)]。"""
    out = []
    try:
        obj = lenient_json_loads(body.decode("utf-8", "ignore"))
    except Exception:
        return out
    if not isinstance(obj, dict):
        return out
    for key in STOREHOUSE_KEYS:
        arr = obj.get(key)
        if not isinstance(arr, list):
            continue
        for item in arr:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("sourceName") or item.get("title") or "子线路")
            sub = None
            for k in SUB_URL_KEYS:
                if item.get(k):
                    sub = str(item[k])
                    break
            if sub and sub.startswith("http") and "更新时间" not in sub:
                out.append((name, sub))
    return out


def extract_urls_from_md(text: str, skip_substr=()):
    """从 Markdown/纯文本中提取全部 http(s) 链接，去重并去掉结尾标点。"""
    urls = [u.rstrip(".,;:。，；、") for u in URL_PATTERN.findall(text)]
    seen, out = set(), []
    for u in urls:
        if not u or any(s in u for s in skip_substr):
            continue
        if u not in seen:
            seen.add(u)
            out.append(u)
    return out


def discover_repo_files(cfg, timeout: float):
    """
    用 GitHub API 枚举仓库内全部配置文件；API 失败则用内置清单。
    返回 [(文件名, raw链接)]。
    """
    api_url = cfg["api"]
    st, status, _, body, _ = fetch(api_url, timeout)
    if status == 200 and body:
        try:
            data = json.loads(body.decode("utf-8", "ignore"))
            tree = data.get("tree") or []
            files = []
            for item in tree:
                path = item.get("path", "")
                if item.get("type") != "blob":
                    continue
                if not path.endswith(cfg["exts"]):
                    continue
                if any(path.startswith(d) for d in cfg["exclude_dirs"]):
                    continue
                if path.split("/")[-1].startswith("."):
                    continue
                files.append(path)
            files = files[: cfg["max_files"]]
            if files:
                return [(p, cfg["raw_base"] + p) for p in files]
        except Exception:
            pass
    # 回退：内置文件清单
    return [(p, cfg["raw_base"] + p) for p in cfg["fallback_files"]]


def probe_one(item, timeout):
    """探测单个链接。返回结果字典。"""
    name, url = item
    res = {
        "name": name, "url": url, "ok": False, "type": "",
        "note": "", "latency": None, "size": 0, "subs": 0,
    }
    final_url, status, headers, body, cost = fetch(url, timeout)
    # GitHub 托管的源失败时，自动走 gh-proxy 镜像重试一次
    if status != 200 and url.startswith("https://raw.githubusercontent.com/"):
        mirror = GH_PROXY_MIRROR + url
        final_url2, status2, _, body2, cost2 = fetch(mirror, timeout)
        if status2 == 200 and body2:
            url, final_url, status, body, cost = mirror, final_url2, status2, body2, cost2
    if status != 200:
        res["note"] = f"HTTP {status}" if status else "连接失败/超时"
        return res
    if not body:
        res["note"] = "空响应"
        return res
    ok, typ, note = classify(body, url)
    res["latency"] = round(cost, 2)
    res["size"] = len(body)
    res["type"] = typ
    res["ok"] = ok
    res["note"] = note
    if final_url and final_url != url:
        res["url"] = final_url                    # 记最终跳转地址（更可靠）
    if ok and typ == "多仓":
        subs = expand_multi(body, url)
        res["subs"] = len(subs)
    return res


def collect_candidates(extra_urls, no_dynamic, timeout):
    """
    收集待探测链接：
      内置列表 -> GitHub 来源 -> (可选)展开多仓发现子链接 -> 追加用户额外链接。
    返回 (待探测列表, 全部结果字典)。
    """
    seen = set()
    pending = []          # (名称, 链接)

    def add(name, url):
        u = url.strip()
        if not u or u in seen:
            return
        seen.add(u)
        pending.append((name, u))

    for name, url in SEED_LINKS:
        add(name, url)
    for u in extra_urls:
        add("自定义", u)

    # ---- GitHub 来源（Markdown 接口大全 + 配置文件仓库）----
    if not no_dynamic:
        print("[*] 抓取 GitHub 他人整理的接口仓库 ...")
        # 1) Markdown 接口大全：抓 README -> 提取链接
        for src_name, md_url in GITHUB_MD_SOURCES:
            _, status, _, body, _ = fetch(md_url, timeout)
            if status == 200 and body:
                urls = extract_urls_from_md(body.decode("utf-8", "ignore"),
                                            skip_substr=("github.com/wuxierj", "license", "star"))
                added = 0
                for u in urls:
                    if u not in seen:
                        add(src_name, u)
                        added += 1
                print(f"    {src_name}: 提取到 {len(urls)} 个链接（新增 {added} 个）")
            else:
                print(f"    {src_name}: 抓取失败，跳过")
        # 2) 配置文件仓库：枚举仓库内文件
        for cfg in GITHUB_REPO_SOURCES:
            files = discover_repo_files(cfg, timeout)
            added = 0
            for fname, raw in files:
                if raw not in seen:
                    add(f"{cfg['short']}·{fname}", raw)
                    added += 1
            print(f"    {cfg['name']}: 发现 {len(files)} 个配置文件（新增 {added} 个）")

    # ---- 动态展开多仓（一层）----
    if not no_dynamic:
        st = time.perf_counter()
        print("[*] 正在展开聚合仓，发现最新子线路 ...")
        with ThreadPoolExecutor(max_workers=6) as ex:
            futs = {ex.submit(fetch, url, timeout): url for _, url in pending}
            for f in as_completed(futs):
                url = futs[f]
                _, status, _, body, _ = f.result()
                if status == 200 and body:
                    ok, typ, _ = classify(body, url)
                    if ok and typ == "多仓":
                        for n, sub in expand_multi(body, url):
                            add(n, sub)
        print(f"[*] 聚合仓展开完成（耗时 {time.perf_counter() - st:.1f}s），共 {len(pending)} 个候选链接")
    return pending


def main():
    ap = argparse.ArgumentParser(description="影视仓资源推送链接检测器")
    ap.add_argument("--timeout", type=float, default=10, help="单链接超时秒数(默认10)")
    ap.add_argument("--workers", type=int, default=12, help="并发线程数(默认12)")
    ap.add_argument("--out", default=None, help="输出文本文件名")
    ap.add_argument("--extra", action="append", default=[], help="额外追加检测链接(可多次)")
    ap.add_argument("--no-dynamic", action="store_true", help="不展开多仓/不抓GitHub，只检测内置列表")
    args = ap.parse_args()

    now = datetime.datetime.now()
    print("=" * 60)
    print(f"  影视仓资源推送链接检测器   运行时间: {now:%Y-%m-%d %H:%M:%S}")
    print("=" * 60)

    pending = collect_candidates(args.extra, args.no_dynamic, args.timeout)

    # ---- 并发探测 ----
    results = []
    ok_count = 0
    print(f"[*] 开始探测 {len(pending)} 个链接（并发 {args.workers}，超时 {args.timeout}s）...\n")
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(probe_one, item, args.timeout): item for item in pending}
        try:
            for i, f in enumerate(as_completed(futs), 1):
                r = f.result()
                results.append(r)
                mark = "✔可用" if r["ok"] else "✘不可用"
                if r["ok"]:
                    ok_count += 1
                sub = f" (+{r['subs']}个子线路)" if r.get("subs") else ""
                lat = f"{r['latency']:.1f}s" if r["latency"] is not None else "-"
                print(f"[{i:>3}/{len(pending)}] {mark} [{r['type'] or '--':<8}] {lat:>5} "
                      f"{r['size']//1024}KB {r['url']}{sub}  {r['note']}")
        except KeyboardInterrupt:
            print("\n[!] 已中断，输出已完成的探测结果。")

    # ---- 汇总输出 ----
    good = [r for r in results if r["ok"]]
    bad = [r for r in results if not r["ok"]]
    good.sort(key=lambda r: r["latency"] or 999)

    print("\n" + "=" * 60)
    print(f"  检测完成：共 {len(results)} 个链接，可用 {len(good)} 个，不可用 {len(bad)} 个")
    print("=" * 60)

    lines = [f"# 影视仓可用资源推送链接   检测时间: {now:%Y-%m-%d %H:%M:%S}",
             f"# 共 {len(good)} 个可用链接（脚本每次运行都会重新探测，链接随时可能失效）", ""]
    if good:
        for i, r in enumerate(good, 1):
            sub = f"（含{r['subs']}个子线路，可继续展开）" if r.get("subs") else ""
            print(f"\n{i}. 【{r['type']}】{r['name']}")
            print(f"   {r['url']}   {sub}")
            lines.append(f"{i}. [{r['type']}] {r['name']}")
            lines.append(f"   {r['url']}{sub}")
    else:
        print("\n[!] 本次没有探测到可用链接，可能是网络问题或所有源均失效，请稍后重试。")
        lines.append("[!] 本次没有可用链接，请稍后重试或检查网络。")

    out_path = args.out or f"影视仓可用链接_{now:%Y%m%d_%H%M}.txt"
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"\n[*] 结果已保存到: {out_path}")

    # 明细 JSON（含不可用原因，便于排查）
    detail_path = f"检测明细_{now:%Y%m%d_%H%M}.json"
    with open(detail_path, "w", encoding="utf-8") as fh:
        json.dump(results, fh, ensure_ascii=False, indent=1)
    print(f"[*] 检测明细已保存到: {detail_path}")


if __name__ == "__main__":
    main()
