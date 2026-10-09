"use client";

import React, { useId, useMemo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import BaseChart from "./BaseChart";
import type { ApexOptions } from "apexcharts";

interface SeriesItem {
    name: string;
    data: number[];
    type?: string;
}

interface CommonLineAreaChartProps {
    id?: string;
    data?: any[];
    xKey?: string;
    yKeys?: string[];
    seriesNames?: string[];
    series?: SeriesItem[];
    seriesTypes?: string[];
    title?: string;
    isLoading?: boolean;
    compact?: boolean;
    type?: 'line' | 'area';
    curve?: 'smooth' | 'straight' | 'stepline';
    showMarkers?: boolean;
    stacked?: boolean;
    stackType?: '100%' | 'normal';
    valueFormatter?: (val: number) => string;
    yAxisTitle?: string;
    yMax?: number;
    colors?: readonly string[] | string[];
    legend?: 'top' | 'bottom' | 'right' | 'left' | false;
    customOptions?: ApexOptions;
    height?: number | string;
    showExport?: boolean;
}

const CommonLineAreaChart = ({
    id: idProp,
    data = [],
    xKey = 'date',
    yKeys = ['value'],
    seriesNames,
    series: seriesProp,
    seriesTypes,
    title,
    isLoading = false,
    compact = false,
    type = 'area',
    curve = 'smooth',
    showMarkers = false,
    stacked = false,
    stackType,
    valueFormatter = (val: number) => `${val.toFixed(1)}`,
    yAxisTitle,
    yMax,
    colors,
    legend = false,
    customOptions = {},
    height,
    showExport = true,
}: CommonLineAreaChartProps) => {
    const theme = useTheme();

    const series: SeriesItem[] = useMemo(() => {
        if (seriesProp) return seriesProp;
        if (!data.length) return yKeys.map((key, i) => ({ name: seriesNames?.[i] || key, data: [], type: seriesTypes?.[i] }));
        return yKeys.map((key, i) => ({
            name: seriesNames?.[i] || key,
            type: seriesTypes?.[i],
            data: data.map(item => Number(item[key]) || 0),
        }));
    }, [seriesProp, data, yKeys, seriesNames, seriesTypes]);

    const categories = useMemo(() =>
        data.map(item => {
            const val = item[xKey];
            if (!val) return '';
            return String(val);
        }),
        [data, xKey]);

    const options: ApexOptions = useMemo(() => {
        const base: ApexOptions = {
            chart: {
                toolbar: { show: false },
                stacked,
                ...(stackType ? { stackType } : {}),
                sparkline: { enabled: false },
            },
            stroke: { curve, width: Array.isArray(customOptions?.stroke?.width) ? 0 : 3 },
            fill: {
                type: type === 'area' ? 'gradient' : 'solid',
                ...(type === 'area' ? {
                    gradient: { shadeIntensity: 1, opacityFrom: 0.7, opacityTo: 0.3, stops: [0, 90, 100] },
                } : { opacity: 1 }),
            },
            xaxis: { 
                categories,
                labels: { 
                    show: true, 
                    rotate: 0, 
                    rotateAlways: false,
                    style: { 
                        fontSize: '11px', 
                        colors: '#475569',
                        fontWeight: 600,
                        fontFamily: theme.typography.fontFamily
                    } 
                },
                axisBorder: { show: true, color: '#CBD5E1', height: 1 },
                axisTicks: { show: true, color: '#CBD5E1' },
            },
            yaxis: {
                show: true,
                max: yMax,
                title: { 
                    text: yAxisTitle, 
                    style: { fontSize: '11px', fontWeight: 600, color: '#475569' } 
                },
                labels: { 
                    show: true, 
                    style: { fontSize: '11px', colors: '#475569', fontWeight: 500 }, 
                    formatter: valueFormatter 
                },
                axisBorder: { show: true, color: '#CBD5E1', width: 1 },
            },
            dataLabels: { enabled: false },
            markers: { size: showMarkers ? 4 : 0 },
            colors: colors ? [...colors] : [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.info.main],
            legend: legend
                ? { show: true, position: legend, offsetX: 0, offsetY: legend === 'right' ? 50 : 0 }
                : { show: false },
            grid: {
                borderColor: '#E2E8F0',
                strokeDashArray: 4,
                padding: {
                    top: 10,
                    right: compact ? 10 : 20,
                    bottom: compact ? 20 : 40,
                    left: compact ? 30 : 50
                }
            },
            tooltip: {
                theme: theme.palette.mode,
                y: { formatter: valueFormatter },
            },
        };

        const finalOptions: ApexOptions = {
            ...base,
            ...customOptions,
            xaxis: {
                ...base.xaxis,
                ...(customOptions.xaxis || {}),
                labels: {
                    ...(base.xaxis?.labels || {}),
                    ...(customOptions.xaxis?.labels || {}),
                    show: true,
                    style: {
                        ...(base.xaxis?.labels?.style || {}),
                        ...(customOptions.xaxis?.labels?.style || {}),
                        colors: '#475569',
                    },
                },
                axisBorder: {
                    ...(base.xaxis?.axisBorder || {}),
                    ...(customOptions.xaxis?.axisBorder || {}),
                    show: true,
                    color: '#CBD5E1',
                },
                axisTicks: {
                    ...(base.xaxis?.axisTicks || {}),
                    ...(customOptions.xaxis?.axisTicks || {}),
                    show: true,
                    color: '#CBD5E1',
                },
                categories,
            },
            yaxis: (Array.isArray(customOptions.yaxis) ? customOptions.yaxis : {
                ...(base.yaxis as any || {}),
                ...(customOptions.yaxis || {}),
                show: true,
                labels: {
                    ...(base.yaxis as any)?.labels || {},
                    ...(customOptions.yaxis as any)?.labels || {},
                    show: true,
                    style: {
                        ...(base.yaxis as any)?.labels?.style || {},
                        ...(customOptions.yaxis as any)?.labels?.style || {},
                        colors: '#475569',
                    }
                },
                axisBorder: {
                    ...((base.yaxis as any)?.axisBorder || {}),
                    ...(customOptions.yaxis as any)?.axisBorder || {},
                    show: true,
                    color: '#CBD5E1',
                }
            }) as any
        };

        return finalOptions;
    }, [
        theme, categories, valueFormatter, yAxisTitle, yMax,
        type, curve, showMarkers, stacked, stackType, colors, legend, customOptions, compact,
    ]);

    const chartHeight = height ?? "100%";
    const generatedId = useId();
    const chartId = idProp || `chart_${generatedId.replace(/:/g, "")}`;

    return (
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', p: compact ? 1 : 2 }}>
            {(title || showExport) && (
                <Box sx={{ mb: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {title ? (
                        <Typography variant={compact ? "subtitle2" : "h6"} sx={{ fontWeight: 700, mt: 0.5 }}>
                            {title}
                        </Typography>
                    ) : (
                        <Box />
                    )}
                </Box>
            )}
            <Box sx={{ flex: 1, minHeight: 0 }}>
                <BaseChart id={chartId} type={type} series={series} options={options} isLoading={isLoading} height={chartHeight} stacked={stacked} />
            </Box>
        </Box>
    );
};

export default CommonLineAreaChart;
