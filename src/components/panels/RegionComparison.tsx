"use client";

import type { ComparisonRow } from "@/lib/comparison";
import { comparisonCsv, downloadCsv } from "@/lib/export";
import { REGION_CODES, regionName, type RegionCode } from "@/lib/geo/regions";
import { BarChart } from "@/components/ui/AnalysisCharts";
import { THEME } from "@/lib/theme";

function ComparisonValue({ text, unit }: { text: string; unit: string }) {
  if (!unit || !text.endsWith(unit)) return <>{text}</>;
  return (
    <>
      <span className="block whitespace-nowrap text-[11px]">
        {text.slice(0, -unit.length)}
      </span>
      <span className="block text-[10px] text-ink-muted">{unit}</span>
    </>
  );
}

export default function RegionComparison({
  region,
  compare,
  onCompare,
  rows,
  selectedId,
  onIndicator,
  conditions,
}: {
  region: RegionCode;
  compare: RegionCode | null;
  onCompare: (code: RegionCode | null) => void;
  rows: ComparisonRow[];
  selectedId: string;
  onIndicator?: (id: string) => void;
  conditions: string;
}) {
  const selected = rows.find(row => row.id === selectedId);
  const numeric = selected && selected.id !== "career-regions" && selected.values.every(value => value === null || typeof value === "number");
  return (
    <section
      aria-label="두 지역 비교"
      className="mb-4 space-y-3 rounded-lg border border-line p-3"
    >
      <label className="block text-xs font-semibold">
        비교할 지역
        <select
          aria-label="비교할 지역"
          className="mt-2 min-h-11 w-full rounded border border-line bg-surface px-2 text-sm"
          value={compare ?? ""}
          onChange={(event) =>
            onCompare((event.target.value || null) as RegionCode | null)
          }
        >
          <option value="">비교 지역 선택</option>
          {REGION_CODES.filter((code) => code !== region).map((code) => (
            <option key={code} value={code}>
              {regionName(code)}
            </option>
          ))}
        </select>
      </label>
      {compare && (
        <>
          {numeric && selected && <BarChart title={`${selected.label} · 두 지역 비교`} unit={selected.unit}
            rows={selected.values.map((value, index) => ({ id: index === 0 ? region : compare, label: regionName(index === 0 ? region : compare), value: typeof value === "number" ? value : null, text: selected.texts[index], color: index === 0 ? THEME.accent : THEME.warningText }))}
            domain={selected.unit === "%" && selected.values.every(value => typeof value !== "number" || value >= 0) ? [0, 100] : undefined}
            note={`${selected.referenceDate} · 차이 ${selected.differenceText} (${regionName(region)} − ${regionName(compare)})`} />}
          <p className="text-xs leading-relaxed text-ink-muted">
            각 지표의 최신 값 · 차이 = {regionName(region)} −{" "}
            {regionName(compare)}. 비율 차이는 %p입니다.
          </p>
          <table
            className="w-full table-fixed border-collapse text-xs"
            aria-label="선택 지역 수치 비교"
          >
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="w-[34%] py-2 text-left">
                  지표
                </th>
                <th scope="col">{regionName(region)}</th>
                <th scope="col">{regionName(compare)}</th>
                <th scope="col">차이</th>
              </tr>
            </thead>
            {Array.from(new Set(rows.map((row) => row.group))).map((group) => (
              <tbody key={group}>
                <tr>
                  <th
                    colSpan={4}
                    scope="colgroup"
                    className="pt-3 pb-1 text-left text-ink-muted"
                  >
                    {group}
                  </th>
                </tr>
                {rows
                  .filter((row) => row.group === group)
                  .map((row) => (
                    <tr
                      key={row.id}
                      data-testid={`comparison-${row.id}`}
                      className={`border-t border-line align-top ${row.id === selectedId ? "bg-accent-soft" : ""}`}
                    >
                      <th
                        scope="row"
                        className="py-2 pr-1 text-left font-normal break-words"
                      >
                        {onIndicator ? (
                          <button
                            type="button"
                            aria-pressed={row.id === selectedId}
                            className="min-h-11 text-left underline decoration-line underline-offset-4"
                            onClick={() => onIndicator(row.id)}
                          >
                            {row.label}
                          </button>
                        ) : (
                          row.label
                        )}
                        <span className="mt-1 block text-[10px] text-ink-muted">
                          {row.referenceDate}
                        </span>
                      </th>
                      {row.texts.map((value, index) => (
                        <td
                          key={index}
                          className="px-0.5 py-2 text-center tabular-nums break-words"
                        >
                          <ComparisonValue text={value} unit={row.unit} />
                        </td>
                      ))}
                      <td className="px-0.5 py-2 text-center tabular-nums break-words">
                        <ComparisonValue
                          text={row.differenceText}
                          unit={row.differenceUnit}
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            ))}
          </table>
          <button
            type="button"
            className="min-h-11 w-full rounded border border-line px-3 text-xs hover:bg-paper"
            onClick={() =>
              downloadCsv(
                `시군비교_${region}_${compare}.csv`,
                comparisonCsv(rows, region, compare, conditions),
              )
            }
          >
            비교표 CSV 저장
          </button>
          <details className="text-xs text-ink-muted">
            <summary className="min-h-11 cursor-pointer py-3">
              지표별 출처와 해석 안내
            </summary>
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <strong>{row.label}</strong>
                  <p>
                    {row.referenceDate} · {row.note}
                  </p>
                  <p>{row.source}</p>
                  {row.sourceUrl
                    .split(" | ")
                    .filter(Boolean)
                    .map((url, index) => (
                      <a
                        key={`${url}:${index}`}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="mr-2 underline"
                      >
                        원자료 {index + 1}
                      </a>
                    ))}
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
