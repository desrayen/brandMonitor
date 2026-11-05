#!/usr/bin/env python3
"""Convert bs_affiliations_all.json -> idempotent upsert SQL for public.bs_affiliations.
Usage: python3 seed_to_sql.py bs_affiliations_all.json > bs_affiliations_all.sql"""
import json, sys
rows = json.load(open(sys.argv[1]))
q = lambda v: 'null' if v is None else "'" + str(v).replace("'", "''") + "'"
vals = ["(%s,%s,%s,%s,%s,%s,%s::jsonb,current_date,'seed')" % (
    q(r['handle']), q(r.get('group_name')), q(r.get('entity')), q(r.get('affiliated_name')),
    q(r['status']), q(r['detail']), q(json.dumps(r['links'], ensure_ascii=False))) for r in rows]
print("insert into public.bs_affiliations (handle, group_name, entity, affiliated_name, status, detail, links, researched_at, researched_by) values\n"
      + ",\n".join(vals)
      + "\non conflict (handle) do update set group_name=excluded.group_name, entity=excluded.entity, affiliated_name=excluded.affiliated_name, status=excluded.status, detail=excluded.detail, links=excluded.links, researched_at=excluded.researched_at, researched_by=excluded.researched_by;")
