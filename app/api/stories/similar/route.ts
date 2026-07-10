import { NextRequest, NextResponse } from "next/server";
import { queryRows } from "@/app/lib/server-postgres";
import { createRouteErrorResponse } from "@/app/lib/server-database-error";
import { normalizeStoryReadingCore } from "@/app/lib/story-reading-similarity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sqlString = (value: string)=>`'${value.replace(/'/g, "''")}'`;

const normalizeReading = (value: string)=>{
    const normalized = String(value ?? "").trim();
    return /^[ぁ-ゖー]+$/.test(normalized) ? normalized : "";
};

const normalizeStoryId = (value: string)=>{
    const normalized = String(value ?? "").trim();
    return /^S[0-9]{7}$/.test(normalized) ? normalized : "";
};

const loadCandidateRows = async (reading: string, storyId: string)=>{
    const coreReading = normalizeStoryReadingCore(reading);
    const prefix = coreReading.slice(0, Math.min(4, coreReading.length));
    const minLength = Math.max(2, coreReading.length - 10);
    const maxLength = coreReading.length + 10;
    const storyFilter = storyId ? `and s.story_id <> ${sqlString(storyId)}` : "";
    const prefixFilter = prefix ? `and (
    s.title_reading_core like ${sqlString(`${prefix}%`)}
    or s.title_reading like ${sqlString(`${prefix}%`)}
    or s.series_title_reading like ${sqlString(`${prefix}%`)}
  )` : "";
    const narrowRows = await queryRows(`
select
  s.story_id,
  s.title,
  s.title_reading,
  coalesce(s.title_reading_core, '') as title_reading_core,
  coalesce(s.series_title, '') as series_title,
  coalesce(s.series_title_reading, '') as series_title_reading,
  coalesce(s.episode_number, '') as episode_number,
  s.contributors::text as contributors_json,
  coalesce(mi.issue_label, '') as issue_label,
  coalesce(mi.issue_title, '') as issue_title,
  coalesce(mt.title, '') as magazine_title
from public.stories s
left join public.magazine_issues mi
  on mi.magazine_issue_id = s.first_magazine_issue_id
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
where s.record_status = 'published'
  and s.status <> 'deleted'
  and btrim(s.title_reading) <> ''
  and s.title_reading <> 'みていぎ'
  ${storyFilter}
  and char_length(coalesce(s.title_reading_core, s.title_reading)) between ${minLength} and ${maxLength}
  ${prefixFilter}
order by s.updated_at desc nulls last
limit 250;
`);
    if (narrowRows.length >= 20 || !coreReading) return narrowRows;
    const broadRows = await queryRows(`
select
  s.story_id,
  s.title,
  s.title_reading,
  coalesce(s.title_reading_core, '') as title_reading_core,
  coalesce(s.series_title, '') as series_title,
  coalesce(s.series_title_reading, '') as series_title_reading,
  coalesce(s.episode_number, '') as episode_number,
  s.contributors::text as contributors_json,
  coalesce(mi.issue_label, '') as issue_label,
  coalesce(mi.issue_title, '') as issue_title,
  coalesce(mt.title, '') as magazine_title
from public.stories s
left join public.magazine_issues mi
  on mi.magazine_issue_id = s.first_magazine_issue_id
left join public.magazine_titles mt
  on mt.id = mi.magazine_key
where s.record_status = 'published'
  and s.status <> 'deleted'
  and btrim(s.title_reading) <> ''
  and s.title_reading <> 'みていぎ'
  ${storyFilter}
  and char_length(coalesce(s.title_reading_core, s.title_reading)) between ${minLength} and ${maxLength}
order by s.updated_at desc nulls last
limit 400;
`);
    const mergedRows = [
        ...narrowRows,
        ...broadRows.filter((row)=>!narrowRows.some((narrowRow)=>narrowRow.story_id === row.story_id))
    ];
    return mergedRows;
};

export async function GET(request: NextRequest) {
    try {
        const reading = normalizeReading(request.nextUrl.searchParams.get("reading") ?? "");
        const storyId = normalizeStoryId(request.nextUrl.searchParams.get("storyId") ?? "");
        if (!reading) {
            return NextResponse.json({
                error: "valid reading is required"
            }, {
                status: 400
            });
        }
        const rows = await loadCandidateRows(reading, storyId);
        const formatContributors = (value: string)=>{
            try {
                const parsed = JSON.parse(value || "[]") as Array<Record<string, unknown>>;
                return parsed.map((entry)=>{
                    const role = String(entry.role ?? "").trim();
                    const name = String(entry.name ?? "").trim();
                    if (!name) return "";
                    return role ? `${role}：${name}` : name;
                }).filter(Boolean).join(" / ");
            } catch {
                return "";
            }
        };
        const candidates = rows.map((row)=>{
            const titleReading = row.title_reading ?? "";
            return {
                storyId: row.story_id ?? "",
                title: row.title ?? "",
                titleReading,
                titleReadingCore: row.title_reading_core ?? normalizeStoryReadingCore(titleReading),
                seriesTitle: row.series_title ?? "",
                seriesReading: row.series_title_reading ?? "",
                episodeLabel: row.episode_number ?? "",
                issueLabel: row.issue_label ?? "",
                issueTitle: row.issue_title ?? "",
                magazineTitle: row.magazine_title ?? "",
                contributorsLabel: formatContributors(row.contributors_json ?? ""),
                score: 0,
                coreScore: 0,
                fullScore: 0,
                sameCore: false
            };
        }).slice(0, 50);
        return NextResponse.json({
            candidates
        }, {
            headers: {
                "Cache-Control": "no-store"
            }
        });
    } catch (error) {
        return createRouteErrorResponse(error, "failed to load similar stories", {
            databaseMessage: "データベースに接続できないため類似作品候補を読み込めません。"
        });
    }
}
