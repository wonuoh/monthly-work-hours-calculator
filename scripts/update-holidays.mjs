// 공공데이터포털 '한국천문연구원_특일 정보' API로 공휴일을 받아 holidays.json에 저장
// 필요: 저장소 Secrets에 HOLIDAY_API_KEY (일반 인증키 Decoding 값)
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.HOLIDAY_API_KEY;
const FILE = new URL('../holidays.json', import.meta.url);
const ENDPOINT = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

if (!KEY) {
  console.log('HOLIDAY_API_KEY가 없어 건너뜁니다.');
  process.exit(0);
}

const pad = (n) => String(n).padStart(2, '0');

async function fetchMonth(year, month) {
  const url = `${ENDPOINT}?serviceKey=${encodeURIComponent(KEY)}&solYear=${year}&solMonth=${pad(month)}&numOfRows=50&_type=json`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      const json = JSON.parse(text);
      const header = json?.response?.header;
      if (header && header.resultCode !== '00') throw new Error(`API ${header.resultCode} ${header.resultMsg}`);
      let items = json?.response?.body?.items?.item ?? [];
      if (!Array.isArray(items)) items = [items];
      return items
        .filter((it) => it && it.isHoliday === 'Y')
        .map((it) => {
          const s = String(it.locdate);
          return { date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, name: String(it.dateName).trim() };
        });
    } catch (e) {
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  return [];
}

const current = JSON.parse(await readFile(FILE, 'utf8'));
current.years ||= {};
const now = new Date();
const thisYear = now.getUTCFullYear();
let changed = false;

for (let year = thisYear - 1; year <= thisYear + 2; year++) {
  try {
    const all = [];
    for (let m = 1; m <= 12; m++) all.push(...(await fetchMonth(year, m)));
    if (all.length < 10) {
      console.log(`${year}: 데이터 미공개 또는 불완전(${all.length}건) - 유지`);
      continue;
    }
    const uniq = [...new Map(all.map((h) => [`${h.date}|${h.name}`, h])).values()]
      .sort((a, b) => a.date.localeCompare(b.date));
    const before = JSON.stringify(current.years[year] || []);
    if (before !== JSON.stringify(uniq)) {
      current.years[year] = uniq;
      changed = true;
      console.log(`${year}: ${uniq.length}건 갱신`);
    } else {
      console.log(`${year}: 변경 없음`);
    }
  } catch (e) {
    console.error(`${year}: 실패 - ${e.message}`);
  }
}

if (changed) {
  current.updatedAt = now.toISOString();
  current.years = Object.fromEntries(Object.entries(current.years).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(FILE, JSON.stringify(current, null, 2) + '\n');
  console.log('holidays.json 저장 완료');
} else {
  console.log('변경 사항 없음');
}
