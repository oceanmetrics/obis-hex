# test fixture release

A subset of the demo release built from the South Atlantic demo store
(`obis_h3_satlantic_v20260728.duckdb`) with `obisindicators::obis_h3_export_parquet(con, "~/data/obis-h3-demo", "demo", res_decade = 1:5)`
on obisindicators branch `export-parquet`. `release.json`, `files.parquet`, `stats.parquet` and
`taxon_groups.parquet` are whole (so `files.parquet` lists partitions that are not copied here);
only `all/res=1`, `all/res=2` and `decade/all/decade=2000/res=1` are included, about 35 KB in all.
The demo store has no EOV or taxon tables, so those layers are absent, as they may be in any
release.
