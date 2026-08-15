import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { FIELD, toAirtableFields, syncShowSeasons, readAirtableConfig } from "./airtable";
import type { ShowSeason } from "./types";

function makeSeason(overrides: Partial<ShowSeason> = {}): ShowSeason {
  return {
    id: "95350-S01",
    showId: 95350,
    name: "Lanterns",
    seasonNumber: 1,
    episodeCount: 8,
    firstEpisodeAirDate: "2026-08-16",
    seasonFinishDate: "2026-10-04",
    firstThirdEpisodeNumber: 3,
    firstThirdAirDate: "2026-08-30",
    network: "HBO",
    ...overrides,
  };
}

describe("toAirtableFields", () => {
  it("maps every column the table expects", () => {
    expect(toAirtableFields(makeSeason())).toEqual({
      [FIELD.name]: "Lanterns",
      [FIELD.tmdbId]: 95350,
      [FIELD.seasonNumber]: 1,
      [FIELD.episodeCount]: 8,
      [FIELD.airDate]: "2026-08-16",
      [FIELD.finishDate]: "2026-10-04",
      [FIELD.firstThirdDate]: "2026-08-30",
      [FIELD.network]: "HBO",
    });
  });

  /**
   * `Feed Key` and `1/3rd Episode` are Airtable formulas. Writing to a computed
   * field is rejected by the API, so the whole batch would fail — and the
   * episode number is already derivable from the episode count Airtable holds.
   */
  it("never writes to the computed columns", () => {
    const keys = Object.keys(toAirtableFields(makeSeason()));
    expect(keys).not.toContain("fldZqKw4zHS607zri"); // Feed Key
    expect(keys).not.toContain("fldAApydDeL0Ki8F4"); // 1/3rd Episode
    expect(keys).toHaveLength(8);
  });

  it("passes nulls through so an unscheduled finale clears the cell", () => {
    const fields = toAirtableFields(
      makeSeason({ seasonFinishDate: null, firstThirdAirDate: null })
    );
    expect(fields[FIELD.finishDate]).toBeNull();
    expect(fields[FIELD.firstThirdDate]).toBeNull();
  });
});

describe("readAirtableConfig", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("returns null when the integration is not configured", () => {
    delete process.env.AIRTABLE_TOKEN;
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_TABLE_ID;
    expect(readAirtableConfig()).toBeNull();
  });

  /** A half-configured deployment must skip, not fire malformed requests. */
  it("returns null when only some credentials are present", () => {
    process.env.AIRTABLE_TOKEN = "pat123";
    delete process.env.AIRTABLE_BASE_ID;
    delete process.env.AIRTABLE_TABLE_ID;
    expect(readAirtableConfig()).toBeNull();
  });

  it("returns the config when all three are set", () => {
    process.env.AIRTABLE_TOKEN = "pat123";
    process.env.AIRTABLE_BASE_ID = "appABC";
    process.env.AIRTABLE_TABLE_ID = "tblXYZ";
    expect(readAirtableConfig()).toEqual({
      token: "pat123",
      baseId: "appABC",
      tableId: "tblXYZ",
    });
  });
});

describe("syncShowSeasons", () => {
  const config = { token: "pat123", baseId: "appABC", tableId: "tblXYZ" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * A fresh Response per call. A Response body can only be read once, so a
   * single shared instance makes every batch after the first fail to parse —
   * which would quietly turn a multi-batch test into a one-batch test.
   */
  const ok = (createdCount: number, total: number) => () =>
    new Response(
      JSON.stringify({
        records: Array.from({ length: total }, (_, i) => ({ id: `rec${i}` })),
        createdRecords: Array.from({ length: createdCount }, (_, i) => `rec${i}`),
      }),
      { status: 200 }
    );

  it("upserts on TMDB ID + Season #, never on the Feed Key formula", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(ok(1, 1));
    await syncShowSeasons([makeSeason()], config);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.performUpsert.fieldsToMergeOn).toEqual([FIELD.tmdbId, FIELD.seasonNumber]);
  });

  /**
   * typecast would let Airtable invent new single-select options on the fly,
   * quietly polluting a Network list that is curated by hand. Better to fail
   * loudly and add the option deliberately.
   */
  it("does not enable typecast", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(ok(1, 1));
    await syncShowSeasons([makeSeason()], config);

    const body = JSON.parse(fetchMock.mock.calls[0][1]!.body as string);
    expect(body.typecast).toBeUndefined();
  });

  it("splits into batches of 10, Airtable's per-request limit", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(ok(0, 10));
    const seasons = Array.from({ length: 23 }, (_, i) =>
      makeSeason({ showId: 1000 + i, id: `${1000 + i}-S01` })
    );
    await syncShowSeasons(seasons, config);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const sizes = fetchMock.mock.calls.map(
      (c) => JSON.parse(c[1]!.body as string).records.length
    );
    expect(sizes).toEqual([10, 10, 3]);
  });

  it("reports created and updated separately", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(ok(2, 5));
    const seasons = Array.from({ length: 5 }, (_, i) =>
      makeSeason({ showId: 2000 + i })
    );
    expect(await syncShowSeasons(seasons, config)).toEqual({
      created: 2,
      updated: 3,
      failed: 0,
    });
  });

  /** One rejected batch must not cost the remaining ones. */
  it("continues past a failing batch and counts it", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response("INVALID_MULTIPLE_CHOICE_OPTIONS", { status: 422 })
    );
    fetchMock.mockImplementationOnce(ok(3, 3));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const seasons = Array.from({ length: 13 }, (_, i) =>
      makeSeason({ showId: 3000 + i })
    );
    expect(await syncShowSeasons(seasons, config)).toEqual({
      created: 3,
      updated: 0,
      failed: 10,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not call Airtable at all when there is nothing to sync", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(ok(0, 0));
    expect(await syncShowSeasons([], config)).toEqual({
      created: 0,
      updated: 0,
      failed: 0,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
