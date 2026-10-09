"use client";

import React, { useId, useMemo } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import BaseChart from "./BaseChart";
import type { ApexOptions } from "apexcharts";

interface SeriesItem {
    name: string;
    data: number[];
}

interface CommonBarChartProps {
    id?: string;
    data?: any[];
    xKey?: string;
    yKey?: string;
    series?: SeriesItem[];
    seriesName?: string;
    title?: string;
    isLoading?: boolean;
    compact?: boolean;
    horizontal?: boolean;
    distributed?: boolean;
    colors?: readonly string[] | string[];
    colorFn?: (item: any) => string;
    valueFormatter?: (val: number) => string;
    yAxisTitle?: string;
    yMax?: number;
    showDataLabels?: boolean;
    legend?: 'top' | 'bottom' | 'right' | 'left' | false;
    customOptions?: ApexOptions;
    height?: number | string;
    showExport?: boolean;
}

const CommonBarChart = ({
    id: idProp,
    data = [],
    xKey = 'name',
    yKey = 'value',
    series: seriesProp,
    seriesName = 'Value',
    title,
    isLoading = false,
    compact = false,
    horizontal = false,
    distributed = false,
    colors,
    colorFn,
    valueFormatter = (val: number) => val.toString(),
    yAxisTitle,
    yMax,
    showDataLabels = true,
    legend = false,
    customOptions = {},
    height,
    showExport = true,
}: CommonBarChartProps) => {
    const theme = useTheme();

    const series: SeriesItem[] = useMemo(() => {
        if (seriesProp) return seriesProp;
        if (!data.length) return [{ name: seriesName, data: [] }];
        return [{ name: seriesName, data: data.map(item => Number(item[yKey]) || 0) }];
    }, [seriesProp, data, yKey, seriesName]);

    const resolvedColors: string[] | undefined = useMemo(() => {
        if (colorFn) return data.map(item => colorFn(item));
        if (colors) return [...colors];
        return undefined;
    }, [colorFn, colors, data]);

    const categories = useMemo(() =>
        data.map(item => item[xKey] || 'Unknown'),
        [data, xKey]);

    const options: ApexOptions = useMemo(() => {
        const base: ApexOptions = {
            chart: {
                toolbar: { show: false },
                type: 'bar',
                sparkline: { enabled: false },
                parentHeightOffset: 0,
            },
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    horizontal,
                    columnWidth: '40%',
                    distributed: distributed || !!colorFn || (!!colors && series[0]?.data.length === (colors?.length ?? 0)),
                },
            },
            dataLabels: {
                enabled: showDataLabels,
                formatter: valueFormatter,
                style: { colors: ['#fff'], fontSize: '11px' },
                offsetY: horizontal ? 0 : -20,
            },
            xaxis: {
                categories,
                labels: {
                    show: true,
                    style: {
                        fontSize: '11px',
                        colors: '#475569',
                        fontWeight: 600,
                        fontFamily: theme.typography.fontFamily
                    },
                    rotate: 0,
                    rotateAlways: false,
                },
                axisBorder: { show: true, color: '#CBD5E1', height: 1 },
                axisTicks: { show: true, color: '#CBD5E1' },
            },
            yaxis: {
                show: true,
                max: yMax,
                title: {
                    text: yAxisTitle,
                    style: { color: '#475569', fontSize: '11px', fontWeight: 600 }
                },
                labels: {
                    show: true,
                    formatter: valueFormatter,
                    style: {
                        colors: '#475569',
                        fontSize: '11px',
                        fontWeight: 500
                    }
                },
                axisBorder: { show: true, color: '#CBD5E1', width: 1 },
            },
            colors: (resolvedColors && resolvedColors.length > 0) ? resolvedColors : [theme.palette.primary.main],
            legend: legend
                ? { show: true, position: legend }
                : { show: false },
            grid: {
                borderColor: '#E2E8F0',
                strokeDashArray: 4,
                padding: {
                    top: 10,
                    right: 20,
                    bottom: 40,
                    left: 50
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
            yaxis: (Array.isArray(base.yaxis) ? base.yaxis : {
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
        theme, categories, resolvedColors, valueFormatter, yAxisTitle, yMax,
        horizontal, distributed, colorFn, colors, series, showDataLabels, legend, customOptions,
    ]);

    const chartHeight = height ?? "100%";
    const generatedId = useId();
    const chartId = idProp || `chart_${generatedId.replace(/:/g, "")}`;

    return (
        <Box sx={{ p: compact ? 1 : 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            {(title || showExport) && (
                <Box sx={{ mb: 1, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {title ? (
                        <Typography variant={compact ? "subtitle2" : "h6"} sx={{ fontWeight: 600, color: 'text.primary', mt: 0.5 }}>
                            {title}
                        </Typography>
                    ) : (
                        <Box />
                    )}
                </Box>
            )}
            <Box sx={{ flex: 1, minHeight: 0 }}>
                <BaseChart id={chartId} type="bar" series={series} options={options} isLoading={isLoading} height={chartHeight} />
            </Box>
        </Box>
    );
};

export default CommonBarChart;
