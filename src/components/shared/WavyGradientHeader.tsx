'use client'
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
 

import React, { useMemo } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useTheme, alpha, darken, lighten } from '@mui/material/styles';
import { keyframes } from '@emotion/react';

interface WavyGradientHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    children?: React.ReactNode;
    compact?: boolean;
    type?: 'default' | 'split';
}

// Helper to extract HSL values and create sophisticated color variations
const createColorPalette = (hexColor: string) => {
    // Convert hex to RGB
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
            case g: h = ((b - r) / d + 2) / 6; break;
            case b: h = ((r - g) / d + 4) / 6; break;
        }
    }

    const hue = Math.round(h * 360);
    const saturation = Math.round(s * 100);
    const lightness = Math.round(l * 100);

    return {
        // Rich deep shade for depth
        deep: `hsl(${hue}, ${Math.min(saturation + 15, 100)}%, ${Math.max(lightness - 20, 10)}%)`,
        // Main vibrant color
        main: `hsl(${hue}, ${saturation}%, ${lightness}%)`,
        // Slightly lighter accent
        accent: `hsl(${(hue + 10) % 360}, ${Math.min(saturation + 10, 100)}%, ${Math.min(lightness + 8, 85)}%)`,
        // Soft highlight
        highlight: `hsl(${(hue + 15) % 360}, ${Math.max(saturation - 5, 30)}%, ${Math.min(lightness + 18, 90)}%)`,
        // Complementary undertone (shifted hue for visual interest)
        undertone: `hsl(${(hue + 25) % 360}, ${Math.max(saturation - 10, 20)}%, ${Math.max(lightness - 10, 15)}%)`,
    };
};

// Gradient movement animation keyframes - full sweep from right to left
const gradientMove = keyframes`
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0% 50%;
    }
`;

const WavyGradientHeader: React.FC<WavyGradientHeaderProps> = ({
    title,
    subtitle,
    children,
    compact = false,
    type = 'default'
}) => {
    const theme = useTheme();
    const isDark = theme.palette.mode === 'dark';
    const primaryColor = theme.palette.primary.main;

    // Generate sophisticated color palette from theme's primary
    const palette = useMemo(() => createColorPalette(primaryColor), [primaryColor]);

    const commonStyles = {
        position: 'relative',
        // Animated gradient - faster movement with more visible contrast
        background: `repeating-linear-gradient(
            90deg,
            ${darken(primaryColor, 0.35)} 0%,
            ${primaryColor} 15%,
            ${lighten(primaryColor, 0.2)} 30%,
            ${primaryColor} 45%,
            ${darken(primaryColor, 0.35)} 60%,
            ${primaryColor} 75%,
            ${darken(primaryColor, 0.35)} 100%
        )`,
        backgroundSize: '200% 100%',
        animation: `${gradientMove} 5s linear infinite`,
        borderRadius: 1.5,
        overflow: 'hidden',
        // Premium shadow with glow effect
        boxShadow: compact ? `0 2px 4px ${alpha(primaryColor, 0.1)}` : `
            0 4px 6px -1px ${alpha(primaryColor, 0.15)},
            0 10px 20px -2px ${alpha(primaryColor, 0.12)},
            0 0 40px -10px ${alpha(primaryColor, isDark ? 0.35 : 0.2)}
        `,
        // Subtle border for depth
        border: `1px solid ${alpha(isDark ? '#fff' : palette.highlight, 0.08)}`,
    };

    const overlay = (
        <>
            {/* Mesh gradient overlay for premium depth */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    background: `
                        radial-gradient(ellipse 80% 50% at 20% 40%, ${alpha(palette.highlight, 0.15)} 0%, transparent 50%),
                        radial-gradient(ellipse 60% 40% at 80% 60%, ${alpha(palette.accent, 0.1)} 0%, transparent 50%)
                    `,
                    pointerEvents: 'none',
                }}
            />

            {/* Elegant top highlight line */}
            <Box
                sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: 1,
                    background: `linear-gradient(
                        90deg,
                        transparent 0%,
                        ${alpha('#fff', isDark ? 0.2 : 0.35)} 20%,
                        ${alpha('#fff', isDark ? 0.25 : 0.45)} 50%,
                        ${alpha('#fff', isDark ? 0.2 : 0.35)} 80%,
                        transparent 100%
                    )`,
                }}
            />

            {/* Subtle noise texture for premium feel */}
            <Box
                sx={{
                    position: 'absolute',
                    inset: 0,
                    opacity: 0.03,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
                    pointerEvents: 'none',
                }}
            />
        </>
    );

    if (type === 'split') {
        const splitCommonStyles = {
            ...commonStyles,
            height: '100%',
            minHeight: '60px', // Increased height from 55px
            display: 'flex',
            alignItems: 'center',
        };

        return (
            <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', sm: 'row' },
                justifyContent: 'space-between', 
                alignItems: { xs: 'flex-start', sm: 'stretch' }, 
                mb: 3, 
                gap: { xs: 2, sm: 2 } 
            }}>
                {/* Left Side: Title & Subtitle */}
                <Box
                    sx={{
                        ...splitCommonStyles,
                        minWidth: { xs: '100%', sm: '260px' },
                        borderTopLeftRadius: 0,
                        borderBottomLeftRadius: 0,
                        borderTopRightRadius: { xs: 12, sm: 22 },
                        borderBottomRightRadius: { xs: 12, sm: 22 },
                        px: { xs: 2, sm: 3, md: 4 },
                        py: { xs: 1.5, sm: 1.5 },
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        alignItems: 'center',
                    }}
                >
                    {overlay}
                    <Box sx={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                        <Typography

                            sx={{
                                color: '#ffffff !important',
                                fontWeight: 600,
                                fontSize: '1.3rem',
                                letterSpacing: '-0.02em',
                                lineHeight: 1.2,
                                textShadow: `0 1px 2px ${alpha('#000', 0.15)}`,
                                width: '100%'
                            }}
                        >
                            {title}
                        </Typography>
                        {subtitle && (
                            <Typography
                                variant="body2"
                                sx={{
                                    display: { xs: 'none', sm: 'block' },
                                    color: 'rgba(255, 255, 255, 0.85) !important',
                                    fontWeight: 400,
                                    fontSize: '0.8rem',
                                    mt: 0.5,
                                    textShadow: `0 1px 1px ${alpha('#000', 0.1)}`,
                                    width: '100%'
                                }}
                            >
                                {subtitle}
                            </Typography>
                        )}
                    </Box>
                </Box>

                {/* Right Side: Actions (Children) - Transparent / Old Styling */}
                <Box
                    sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: { xs: 'flex-start', sm: 'flex-end' },
                        gap: 1.5,
                        minWidth: { xs: '100%', sm: '300px' },
                        height: '100%',
                        px: { xs: 0, sm: 3, md: 4 },
                        overflowX: { xs: 'auto', sm: 'visible' },
                        whiteSpace: 'nowrap',
                        pb: { xs: 1, sm: 0 },
                        '&::-webkit-scrollbar': { display: 'none' },
                        msOverflowStyle: 'none',
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch'
                    }}
                >
                    {children}
                </Box>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                ...commonStyles,
                px: compact ? { xs: 2, sm: 3, md: 3.5 } : { xs: 2.5, sm: 3.5, md: 4 },
                py: compact ? { xs: 2.25, sm: 2.75 } : { xs: 3, sm: 3.75, md: 4.5 },
                minHeight: compact ? { xs: 72, sm: 80 } : { xs: 96, sm: 112 },
                marginBottom: compact ? { xs: 2, sm: 2.5 } : 3,
                display: 'flex',
                alignItems: 'center',
            }}
        >
            {overlay}

            {/* Geometric accent - large soft circle (hidden in compact mode) */}
            {!compact && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: '-60%',
                        right: '-15%',
                        width: 300,
                        height: 300,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${alpha('#fff', 0.08)} 0%, transparent 70%)`,
                        pointerEvents: 'none',
                    }}
                />
            )}

            {/* Secondary geometric accent (hidden in compact mode) */}
            {!compact && (
                <Box
                    sx={{
                        position: 'absolute',
                        bottom: '-50%',
                        left: '-10%',
                        width: 200,
                        height: 200,
                        borderRadius: '50%',
                        background: `radial-gradient(circle, ${alpha(palette.highlight, 0.06)} 0%, transparent 70%)`,
                        pointerEvents: 'none',
                    }}
                />
            )}


            {/* Content */}
            <Box
                sx={{
                    position: 'relative',
                    zIndex: 1,
                    width: '100%',
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    justifyContent: 'space-between',
                    gap: { xs: 2, sm: 2 },
                    flexWrap: 'nowrap'
                }}
            >
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.75, width: { xs: '100%', sm: 'auto' } }}>
                    <Typography
                        variant={compact ? 'h5' : 'h5'}
                        sx={{
                            color: '#ffffff !important',
                            fontWeight: 600,
                            letterSpacing: '-0.02em',
                            fontSize: compact ? { xs: '1.1rem', sm: '1.3rem', md: '1.4rem' } : { xs: '1.15rem', sm: '1.4rem', md: '1.55rem' },
                            textShadow: `0 1px 2px ${alpha('#000', 0.15)}`,
                            whiteSpace: { xs: 'normal', sm: 'nowrap' },
                            lineHeight: 1.25,
                        }}
                    >
                        {title}
                    </Typography>
                    {subtitle && (
                        <Typography
                            variant="body2"
                            sx={{
                                display: { xs: 'none', sm: 'block' },
                                color: 'rgba(255, 255, 255, 0.88) !important',
                                fontWeight: 400,
                                fontSize: { xs: '0.75rem', sm: '0.85rem' },
                                textShadow: `0 1px 1px ${alpha('#000', 0.1)}`,
                                whiteSpace: 'normal',
                                opacity: 0.92,
                                maxWidth: { xs: '100%', sm: '420px', md: '650px', lg: '850px' },
                                lineHeight: 1.35,
                            }}
                        >
                            {subtitle}
                        </Typography>
                    )}
                </Box>
 
                {children && (
                    <Box sx={{ 
                        display: 'flex', 
                        gap: 1, 
                        alignItems: 'center', 
                        flexShrink: 0,
                        width: { xs: '100%', sm: 'auto' },
                        maxWidth: { xs: '100%', sm: 'auto' },
                        overflowX: { xs: 'auto', sm: 'visible' },
                        '&::-webkit-scrollbar': { display: 'none' },
                        msOverflowStyle: 'none',
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch',
                        px: { xs: 0.5, sm: 0 },
                    }}>
                        {children}
                    </Box>
                )}
            </Box>
        </Box>
    );
};

export default WavyGradientHeader;
