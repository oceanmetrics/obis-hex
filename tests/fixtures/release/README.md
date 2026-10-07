# test fixture release

A subset of the demo release built from the South Atlantic demo store
(`obis_h3_satlantic_v20260728.duckdb`) with obisindicators 0.7.1 (layout v2, branch `export-parquet`):
`obis_h3_export_parquet(con, "~/data/obis-h3-demo", "demo", res_decade = 1:5)`.
`release.json`, `files.parquet`, `stats.parquet` and `taxon_groups.parquet` are whole (so
`files.parquet` lists partitions that are not copied here); only `all/res=1`, `all/res=2`,
`decade/all/decade=2000/res=1` and three res-7 parent partitions (`all/res=7/p=83de80fffffffff`,
`p=83de81fffffffff`, `p=83de83fffffffff`) are included, about 100 KB in all. The demo store has no
EOV table and an empty taxon table, so those layers are absent or empty, as they may be in any
release.
