"use client";

import React, { useId, useMemo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import BaseChart from "./BaseChart";
import type { ApexOptions } from "apexcharts";

interface CommonPieChartProps {
    id?: string;
    values?: number[];
    labels?: string[];
    data?: Record<string, number> | any;
    title?: string;
    isLoading?: boolean;
    compact?: boolean;
    type?: 'pie' | 'donut';
    colors?: readonly string[] | string[];
    valueFormatter?: (val: number) => string;
    legend?: 'top' | 'bottom' | 'right' | 'left' | false;
    height?: number | string;
    showExport?: boolean;
}

const CommonPieChart = ({
    id: idProp,
    values,
    labels,
    data,
    title,
    isLoading = false,
    compact = false,
    type = 'pie',
    colors,
    valueFormatter = (val: number) => `${val.toFixed(1)}%`,
    legend = 'bottom',
    height,
    showExport = true,
}: CommonPieChartProps) => {
    const theme = useTheme();

    const chartSeries: number[] = useMemo(() => {
        if (values) return values;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.values(data).map(v => Number(v) || 0);
        }
        return [];
    }, [values, data]);

    const chartLabels: string[] = useMemo(() => {
        if (labels) return labels;
        if (data && typeof data === 'object' && !Array.isArray(data)) {
            return Object.keys(data);
        }
        return [];
    }, [labels, data]);


    const options: ApexOptions = useMemo(() => {
        const defaultColors = [
        theme.palette.success.main,
        theme.palette.warning.main,
        theme.palette.error.main,
        theme.palette.info.main,
        theme.palette.primary.main,
        ];
        return {
        labels: chartLabels,
        colors: colors ? [...colors] : defaultColors,
        stroke: { show: false },
        dataLabels: {
            enabled: !compact,
            formatter: (val: number) => `${val.toFixed(1)}%`,
            style: { fontSize: '11px', fontWeight: 600, colors: ['#fff'] },
        },
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    labels: {
                        show: true,
                        total: {
                            show: true,
                            label: 'Total',
                            fontSize: compact ? '12px' : '16px',
                            formatter: (w: any) => {
                                const total = w.globals.seriesTotals.reduce((a: number, b: number) => a + b, 0);
                                return valueFormatter(total);
                            }
                        }
                    }
                }
            }
        },
        legend: legend !== false
            ? {
                show: true,
                position: legend,
                offsetY: 0,
                fontSize: compact ? '10px' : '12px'
            }
            : { show: false },
        tooltip: {
            theme: theme.palette.mode,
            y: { formatter: valueFormatter },
        },
        };
    }, [theme, chartLabels, colors, legend, valueFormatter, compact]);

    const chartHeight = height ?? (compact ? 250 : "100%");
    const generatedId = useId();
    const chartId = idProp || `chart_${generatedId.replace(/:/g, "")}`;

    return (
        <Box sx={{ p: compact ? 1 : 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {(title || showExport) && (
                <Box sx={{ mb: compact ? 1 : 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {title ? (
                        <Typography variant={compact ? "subtitle2" : "h6"} sx={{ fontWeight: 600, color: 'text.primary', mt: 0.5 }}>
                            {title}
                        </Typography>
                    ) : (
                        <Box />
                    )}
                </Box>
            )}
            <Box sx={{ flex: 1, minHeight: 0, position: 'relative' }}>
                <BaseChart id={chartId} type={type} series={chartSeries} options={options} isLoading={isLoading} height={chartHeight} />
            </Box>
        </Box>
    );
};

export default CommonPieChart;
