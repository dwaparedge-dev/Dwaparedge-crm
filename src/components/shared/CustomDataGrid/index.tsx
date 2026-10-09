'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
/* eslint-disable @typescript-eslint/no-explicit-any, react/display-name, react-hooks/set-state-in-effect */

import React, { useMemo, useState, useEffect } from 'react';
import {
  DataGrid,
  GridColDef,
  GridPagination,
  GridPaginationModel,
  GridRowParams,
  GridValidRowModel,
} from '@mui/x-data-grid';
import { useTheme, alpha, useMediaQuery, type SxProps, type Theme } from '@mui/material';
import Button from '@mui/material/Button';
import SettingsIcon from '@mui/icons-material/Settings';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import { TableSkeleton } from '@/components/shared/skeletons';

export interface CustomDataGridProps<R extends GridValidRowModel = any> {
  rows?: R[];
  columns?: GridColDef<R>[];
  rowCount?: number;
  loading?: boolean;
  rowsPerPageOptions?: number[];
  pageSizeOptions?: number[];
  rowHeight?: number;
  paginationModel?: GridPaginationModel;
  onPaginationModelChange?: (model: GridPaginationModel) => void;
  paginationMode?: 'client' | 'server';
  getRowId?: (row: R) => string | number;
  checkboxSelection?: boolean;
  rowSelectionModel?: (string | number)[];
  onRowSelectionModelChange?: (ids: (string | number)[]) => void;
  hideFooterSelectedRowCount?: boolean;
  onColumnCustomize?: () => void;
  onBulkEdit?: () => void;
  onTriggerDetail?: (row: R) => void;
  onRowClick?: (params: GridRowParams<R>, event?: React.MouseEvent, details?: any) => void;
  sx?: SxProps<Theme>;
  disableColumnFilter?: boolean;
  disableColumnMenu?: boolean;
  disableRowSelectionOnClick?: boolean;
  autoHeight?: boolean;
  initialState?: any;
}

export const CustomDataGrid = <R extends GridValidRowModel = any>({
  rows = [],
  columns = [],
  rowCount,
  loading,
  rowsPerPageOptions,
  pageSizeOptions,
  rowHeight,
  paginationModel,
  onPaginationModelChange,
  paginationMode = 'client',
  getRowId,
  checkboxSelection = false,
  rowSelectionModel,
  onRowSelectionModelChange,
  hideFooterSelectedRowCount = true,
  onColumnCustomize,
  onBulkEdit,
  onRowClick,
  sx,
  disableColumnFilter = true,
  disableColumnMenu = true,
  disableRowSelectionOnClick = true,
  autoHeight = false,
  initialState,
}: CustomDataGridProps<R>) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const processedColumns = useMemo(() => {
    return columns.map((col) => {
      let smartMinWidth = col.minWidth || col.width || 100;
      if (col.field === 'actions') {
        smartMinWidth = col.minWidth || col.width || 140;
      } else if (col.field === 'code' || col.field === 'lotNumber' || col.field === 'soNumber') {
        smartMinWidth = col.minWidth || col.width || 130;
      } else if (col.headerName?.toLowerCase().includes('status')) {
        smartMinWidth = col.minWidth || col.width || 100;
      } else if (col.headerName?.toLowerCase().includes('date') || col.headerName?.toLowerCase().includes('time')) {
        smartMinWidth = col.minWidth || col.width || 160;
      } else if (col.headerName?.toLowerCase().includes('price') || col.headerName?.toLowerCase().includes('cost')) {
        smartMinWidth = col.minWidth || col.width || 120;
      } else if (col.headerName?.toLowerCase().includes('name')) {
        smartMinWidth = col.minWidth || col.width || 150;
      }

      return {
        ...col,
        flex: col.flex !== undefined ? col.flex : col.field === 'actions' ? 0 : 1,
        minWidth: smartMinWidth,
      };
    });
  }, [columns]);

  const CustomPagination = useMemo(() => {
    return () => (
      <Box
        sx={{
          display: 'flex',
          width: '100%',
          justifyContent: 'space-between',
          alignItems: 'center',
          p: isMobile ? 0.5 : 1,
        }}
      >
        {onColumnCustomize && (
          <Button
            startIcon={<SettingsIcon />}
            onClick={onColumnCustomize}
            size="small"
            sx={{
              textTransform: 'none',
              ml: isMobile ? 1 : 2,
              color: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              borderRadius: '50px',
              px: isMobile ? 2 : 3,
              py: 1,
              minWidth: isMobile ? 'auto' : undefined,
              '&:hover': {
                backgroundColor: alpha(theme.palette.text.primary, 0.1),
                color: theme.palette.text.primary,
              },
            }}
          >
            {!isMobile && 'Customize Columns'}
          </Button>
        )}
        {onBulkEdit && (
          <Button
            startIcon={<EditIcon />}
            onClick={onBulkEdit}
            size="small"
            sx={{
              textTransform: 'none',
              ml: 1,
              color: theme.palette.primary.main,
              backgroundColor: alpha(theme.palette.primary.main, 0.1),
              borderRadius: '50px',
              px: isMobile ? 2 : 3,
              py: 1,
              minWidth: isMobile ? 'auto' : undefined,
              '&:hover': {
                backgroundColor: alpha(theme.palette.text.primary, 0.1),
                color: theme.palette.text.primary,
              },
            }}
          >
            {!isMobile && 'Bulk Action'}
          </Button>
        )}
        <GridPagination />
      </Box>
    );
  }, [onColumnCustomize, onBulkEdit, theme.palette.primary.main, theme.palette.text.primary, isMobile]);

  const gridSx = useMemo(
    () => ({
      height: autoHeight ? 'auto' : 'auto',
      minHeight: autoHeight ? 'unset' : 400,
      maxHeight: autoHeight ? 'none' : 'calc(100vh - 400px)',
      '& .MuiDataGrid-row': {
        cursor: onRowClick ? 'pointer' : 'default',
        '&:hover': onRowClick
          ? { backgroundColor: alpha(theme.palette.primary.main, 0.04) }
          : undefined,
      },
      '& .MuiDataGrid-cell': {
        display: 'flex',
        alignItems: 'center',
      },
      '& .MuiDataGrid-cell:focus': { outline: 'none' },
      '& .MuiDataGrid-columnHeader:focus': { outline: 'none' },
      '& .MuiDataGrid-columnHeader--checkboxSelection, & .MuiDataGrid-cell--checkboxSelection': {
        maxWidth: '10px !important',
        minWidth: '10px !important',
        width: '10px !important',
      },
      '& .MuiDataGrid-checkboxInput': { padding: '2px' },
      ...sx,
    }),
    [sx, autoHeight, onRowClick, theme.palette.primary.main]
  );

  const validatedRows = Array.isArray(rows) ? rows : [];
  const validatedColumns = Array.isArray(processedColumns) ? processedColumns : [];
  const validatedSelectionModel = Array.isArray(rowSelectionModel) ? rowSelectionModel : [];
  const isControlledPagination = Boolean(paginationModel && onPaginationModelChange);

  const safePaginationModel = useMemo(() => {
    if (paginationModel && typeof paginationModel.page === 'number' && typeof paginationModel.pageSize === 'number') {
      return paginationModel;
    }
    return { page: 0, pageSize: 10 };
  }, [paginationModel]);

  const safePageSizeOptions = useMemo(() => {
    const opts = pageSizeOptions || rowsPerPageOptions || [10, 15, 20, 25, 50, 100];
    const currentSize = safePaginationModel?.pageSize;
    if (currentSize && !opts.includes(currentSize)) {
      const merged = [...opts, currentSize];
      merged.sort((a, b) => a - b);
      return merged;
    }
    return opts;
  }, [pageSizeOptions, rowsPerPageOptions, safePaginationModel?.pageSize]);

  if (!isMounted || validatedColumns.length === 0) {
    return null;
  }

  return (
    <DataGrid
      rows={validatedRows}
      columns={validatedColumns}
      checkboxSelection={Boolean(checkboxSelection)}
      rowSelectionModel={{
        type: 'include',
        ids: new Set(validatedSelectionModel),
      }}
      onRowSelectionModelChange={(newModel: any) => {
        if (onRowSelectionModelChange) {
          const ids = Array.from(newModel.ids || []);
          onRowSelectionModelChange(ids as (string | number)[]);
        }
      }}
      hideFooterSelectedRowCount={Boolean(hideFooterSelectedRowCount)}
      disableRowSelectionOnClick={Boolean(disableRowSelectionOnClick)}
      onRowClick={
        onRowClick
          ? (params, event, details) => {
              const target = (event as any)?.target as HTMLElement | null;
              if (
                target?.closest('[data-field="actions"]') ||
                target?.closest('[data-field="__check__"]') ||
                target?.closest('.MuiDataGrid-cellCheckbox') ||
                target?.closest('button') ||
                target?.closest('a') ||
                target?.closest('.MuiIconButton-root') ||
                target?.closest('.MuiCheckbox-root') ||
                target?.closest('.MuiSwitch-root')
              ) {
                return;
              }
              onRowClick(params, event as any, details);
            }
          : undefined
      }
      pagination
      rowCount={paginationMode === 'server' && typeof rowCount === 'number' ? rowCount : undefined}
      loading={Boolean(loading)}
      autoHeight={autoHeight}
      rowHeight={rowHeight}
      slots={{
        pagination: CustomPagination,
        loadingOverlay: () => (
          <TableSkeleton
            standalone={false}
            rowCount={8}
            columnCount={Math.min(validatedColumns.length || 6, 8)}
            showHeader={false}
          />
        ),
      }}
      pageSizeOptions={safePageSizeOptions}
      paginationMode={paginationMode === 'server' ? 'server' : 'client'}
      {...(isControlledPagination
        ? {
            paginationModel: safePaginationModel,
            onPaginationModelChange: onPaginationModelChange,
          }
        : {})}
      disableColumnFilter={Boolean(disableColumnFilter)}
      disableColumnMenu={Boolean(disableColumnMenu)}
      getRowId={(row: any) => {
        if (getRowId) return getRowId(row);
        return row?.id || row?._id || Math.random().toString();
      }}
      initialState={initialState}
      sx={gridSx}
    />
  );
};

export default CustomDataGrid;
