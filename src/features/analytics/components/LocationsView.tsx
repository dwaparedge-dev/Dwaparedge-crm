"use client";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import ChartCard from "@/components/shared/ChartCard";
import type { Overview } from "../reports";
import { countryName, pct, placeLabel } from "../format";
import { BarList } from "./BarList";

export interface Drill { country?: string; region?: string; city?: string }

interface Row { key: string; name: string; sessions: number; visitors: number; demo: number | null; go: Drill | null }

/** Country, then state, then city: each click narrows the whole report to that place; the breadcrumb widens it again. */
export function LocationsView({ data, onDrill }: { data: Overview; onDrill: (d: Drill) => void }) {
  const country = data.filters.country ?? undefined;
  const region = data.filters.region ?? undefined;
  const city = data.filters.city ?? undefined;
  const level = !country ? "country" : !region ? "state" : "city";
  const rows: Row[] =
    level === "country"
      ? data.countries.map((c) => ({ key: c.label, name: c.label === "Unknown" ? "Country not available" : countryName(c.label), sessions: c.sessions, visitors: c.visitors, demo: null, go: c.label === "Unknown" ? null : { country: c.label } }))
      : level === "state"
        ? data.regions.map((r) => ({ key: r.region ?? "-", name: r.region ?? "State not available", sessions: r.sessions, visitors: r.visitors, demo: r.demoRequests, go: r.region ? { country, region: r.region } : null }))
        : data.cities.map((c) => ({ key: c.city ?? "-", name: c.city ?? "City not available", sessions: c.sessions, visitors: c.visitors, demo: c.demoRequests, go: c.city ? { country, region, city: c.city } : null }));
  const total = rows.reduce((a, r) => a + r.sessions, 0) || 1;
  const heading = level === "country" ? "Countries" : level === "state" ? `States in ${countryName(country)}` : `Cities in ${region}`;

  return (
    <Grid container spacing={2.5}>
      <Grid size={{ xs: 12, md: 7 }}>
        <ChartCard title={heading} subtitle={level === "city" ? "The deepest level. Use the path above to go back up" : "Click a row to narrow the whole report to it"}>
          <Breadcrumbs sx={{ mb: 1.5 }} aria-label="Location path">
            {country || region || city ? <Link component="button" id="loc-all" underline="hover" onClick={() => onDrill({})}>All countries</Link> : <Typography variant="body2" color="text.primary">All countries</Typography>}
            {country && (region ? <Link component="button" id="loc-country" underline="hover" onClick={() => onDrill({ country })}>{countryName(country)}</Link> : <Typography variant="body2" color="text.primary">{countryName(country)}</Typography>)}
            {region && (city ? <Link component="button" id="loc-region" underline="hover" onClick={() => onDrill({ country, region })}>{region}</Link> : <Typography variant="body2" color="text.primary">{region}</Typography>)}
            {city && <Typography variant="body2" color="text.primary">{city}</Typography>}
          </Breadcrumbs>
          {rows.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>Nothing yet for this period</Typography> : (
            <Box sx={{ overflowX: "auto" }}>
              <Table size="small" aria-label={heading}>
                <TableHead><TableRow><TableCell>Place</TableCell><TableCell align="right">Visits</TableCell><TableCell align="right">Visitors</TableCell><TableCell sx={{ minWidth: 120 }}>Share</TableCell><TableCell align="right">Demo requests</TableCell></TableRow></TableHead>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.key} hover={Boolean(r.go)} onClick={r.go ? () => onDrill(r.go!) : undefined} sx={{ cursor: r.go ? "pointer" : "default" }}>
                      <TableCell sx={{ fontWeight: 600 }}>{r.go ? <Link component="span" underline="hover">{r.name}</Link> : r.name}</TableCell>
                      <TableCell align="right">{r.sessions.toLocaleString("en-IN")}</TableCell>
                      <TableCell align="right">{r.visitors.toLocaleString("en-IN")}</TableCell>
                      <TableCell>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                          <Box sx={{ flexGrow: 1, height: 6, borderRadius: 3, bgcolor: "action.hover" }}><Box sx={{ height: 6, borderRadius: 3, bgcolor: "primary.main", width: `${(r.sessions / total) * 100}%` }} /></Box>
                          <Typography variant="caption" sx={{ minWidth: 34, textAlign: "right" }}>{pct(r.sessions / total, 0)}</Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="right">{r.demo === null ? "—" : r.demo}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}
        </ChartCard>
      </Grid>
      <Grid size={{ xs: 12, md: 5 }}>
        <BarList id="top-cities" title="Top cities" subtitle={country ? "Within the current selection" : "Across all countries"}
          rows={data.cities.slice(0, 15).map((c) => ({ label: placeLabel(c), value: c.sessions, hint: c.demoRequests ? `${c.demoRequests} demo` : undefined }))} empty="No city data yet. The website's host supplies the city." />
      </Grid>
    </Grid>
  );
}
