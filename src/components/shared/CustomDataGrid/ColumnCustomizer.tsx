'use client';
/* Copied from FactoONE (Factoonemini/frontend) so both products share one look. Keep in sync rather than restyling here. */
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect } from 'react';
import {
    Drawer,
    Box,
    Typography,
    IconButton,
    Button,
    List,
    ListItem,
    Checkbox,
    FormControlLabel,
    Divider,
    Stack,
} from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ColumnDefinition {
    field: string;
    headerName: string;
}

interface ColumnCustomizerProps {
    open: boolean;
    onClose: () => void;
    allColumns: ColumnDefinition[];
    visibleColumns: string[];
    columnOrder: string[];
    defaultVisibleColumns?: string[];
    defaultColumnOrder?: string[];
    onSave: (visibleColumns: string[], columnOrder: string[]) => void;
    storageKey?: string;
    excludeFields?: string[]; // Fields that cannot be hidden/reordered (e.g., 'actions')
}

interface SortableItemProps {
    id: string;
    column: ColumnDefinition;
    isVisible: boolean;
    onToggle: (field: string) => void;
    isDisabled: boolean;
}

const SortableItem: React.FC<SortableItemProps> = ({ id, column, isVisible, onToggle, isDisabled }) => {
    const theme = useTheme();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: isDisabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <ListItem
            ref={setNodeRef}
            style={style}
            sx={{
                py: 1.5,
                px: 2,
                mb: 1,
                backgroundColor: theme.palette.background.paper,
                border: `1px solid ${alpha(theme.palette.divider, 0.1)}`,
                borderRadius: 1,
                cursor: isDisabled ? 'default' : 'grab',
                '&:active': {
                    cursor: isDisabled ? 'default' : 'grabbing',
                },
                '&:hover': {
                    backgroundColor: alpha(theme.palette.primary.main, 0.04),
                },
            }}
        >
            <Box
                {...attributes}
                {...listeners}
                sx={{
                    display: 'flex',
                    alignItems: 'center',
                    mr: 1,
                    color: isDisabled ? theme.palette.action.disabled : theme.palette.text.secondary,
                    cursor: isDisabled ? 'default' : 'grab',
                }}
            >
                <DragIndicatorIcon />
            </Box>
            <FormControlLabel
                control={
                    <Checkbox
                        checked={isVisible}
                        onChange={() => onToggle(column.field)}
                        disabled={isDisabled}
                    />
                }
                label={column.headerName}
                sx={{ flex: 1, m: 0 }}
            />
        </ListItem>
    );
};

const DEFAULT_EXCLUDE_FIELDS = ['actions'];

const ColumnCustomizer: React.FC<ColumnCustomizerProps> = ({
    open,
    onClose,
    allColumns = [],
    visibleColumns: initialVisibleColumns = [],
    columnOrder: initialColumnOrder = [],
    defaultVisibleColumns,
    defaultColumnOrder,
    onSave,
    storageKey,
    excludeFields = DEFAULT_EXCLUDE_FIELDS,
}) => {
    const theme = useTheme();
    const t = (key: string) => {
        const translations: Record<string, string> = {
            'common.customizeColumns': 'Customize Columns',
            'common.reset': 'Reset',
            'common.save': 'Save',
            'common.cancel': 'Cancel',
            'table.columnCustomizer.title': 'Customize Columns',
            'table.columnCustomizer.instructions': 'Drag to reorder. Uncheck to hide.',
            'table.columnCustomizer.reset': 'Reset to Default',
            'table.columnCustomizer.cancel': 'Cancel',
            'table.columnCustomizer.save': 'Apply',
        };
        return translations[key] || key;
    };
    
    const [visibleColumns, setVisibleColumns] = useState<string[]>(initialVisibleColumns);
    const [columnOrder, setColumnOrder] = useState<string[]>(initialColumnOrder);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Update local state when props change
    useEffect(() => {
        // If initial columns provided, use them. Else, default to all columns
        const defaultAll = allColumns.map((col) => col.field);

        if (initialVisibleColumns.length > 0) {
            setVisibleColumns(initialVisibleColumns);
        } else {
            setVisibleColumns(defaultAll);
        }

        if (initialColumnOrder.length > 0) {
            const missing = allColumns
                .map((col) => col.field)
                .filter((field) => !initialColumnOrder.includes(field));
            setColumnOrder([
                ...initialColumnOrder.filter((f) => f !== 'actions'),
                ...missing.filter((f) => f !== 'actions'),
                ...(initialColumnOrder.includes('actions') || missing.includes('actions') ? ['actions'] : []),
            ]);
        } else {
            setColumnOrder(defaultAll);
        }
    }, [initialVisibleColumns, initialColumnOrder, open, allColumns]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            setColumnOrder((items) => {
                const oldIndex = items.indexOf(active.id as string);
                const newIndex = items.indexOf(over.id as string);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    const handleToggleColumn = (field: string) => {
        setVisibleColumns((prev) => {
            if (prev.includes(field)) {
                // Prevent hiding the last visible column
                if (prev.length === 1) {
                    return prev;
                }
                return prev.filter((f) => f !== field);
            } else {
                return [...prev, field];
            }
        });
    };

    const handleReset = () => {
        const resetVisible = defaultVisibleColumns 
            ? [...defaultVisibleColumns]
            : allColumns.map((col) => col.field);
            
        const resetOrder = defaultColumnOrder 
            ? [...defaultColumnOrder]
            : allColumns.map((col) => col.field);
            
        setVisibleColumns(resetVisible);
        setColumnOrder(resetOrder);
    };

    const handleSave = () => {
        onSave(visibleColumns, columnOrder);

        // Persist to localStorage if storageKey is provided
        if (storageKey) {
            localStorage.setItem(
                storageKey,
                JSON.stringify({ visible: visibleColumns, order: columnOrder })
            );
        }

        onClose();
    };

    const handleCancel = () => {
        // Reset to initial values
        setVisibleColumns(initialVisibleColumns);
        setColumnOrder(initialColumnOrder);
        onClose();
    };

    // Filter out excluded fields for the sortable list
    const sortableColumns = columnOrder.filter((field) => !excludeFields.includes(field));

    return (
        <Drawer
            anchor="right"
            open={open}
            onClose={handleCancel}
            sx={{
                '& .MuiDrawer-paper': {
                    width: 400,
                    maxWidth: '90vw',
                },
            }}
        >
            <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <Box
                    sx={{
                        p: 3,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        borderBottom: `1px solid ${theme.palette.divider}`,
                    }}
                >
                    <Typography variant="h5" sx={{ fontWeight: 600 }}>
                        {t('table.columnCustomizer.title')}
                    </Typography>
                    <IconButton onClick={handleCancel} size="small">
                        <CloseIcon />
                    </IconButton>
                </Box>

                {/* Instructions */}
                <Box sx={{ px: 3, pt: 2, pb: 1 }}>
                    <Typography variant="body2" color="text.secondary">
                        {t('table.columnCustomizer.instructions')}
                    </Typography>
                </Box>

                {/* Column List */}
                <Box sx={{ flex: 1, overflow: 'auto', px: 3, py: 2 }}>
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={sortableColumns}
                            strategy={verticalListSortingStrategy}
                        >
                            <List sx={{ p: 0 }}>
                                {sortableColumns.map((field) => {
                                    const column = allColumns.find((col) => col.field === field);
                                    if (!column) return null;

                                    return (
                                        <SortableItem
                                            key={field}
                                            id={field}
                                            column={column}
                                            isVisible={visibleColumns.includes(field)}
                                            onToggle={handleToggleColumn}
                                            isDisabled={false}
                                        />
                                    );
                                })}
                            </List>
                        </SortableContext>
                    </DndContext>
                </Box>

                <Divider />

                {/* Actions */}
                <Box sx={{ p: 3 }}>
                    <Stack spacing={2}>
                        <Button
                            variant="outlined"
                            startIcon={<RestartAltIcon />}
                            onClick={handleReset}
                            fullWidth
                        >
                            {t('table.columnCustomizer.reset')}
                        </Button>
                        <Stack direction="row" spacing={2}>
                            <Button
                                variant="outlined"
                                onClick={handleCancel}
                                fullWidth
                            >
                                {t('table.columnCustomizer.cancel')}
                            </Button>
                            <Button
                                variant="contained"
                                onClick={handleSave}
                                fullWidth
                            >
                                {t('table.columnCustomizer.save')}
                            </Button>
                        </Stack>
                    </Stack>
                </Box>
            </Box>
        </Drawer>
    );
};

export default ColumnCustomizer;
