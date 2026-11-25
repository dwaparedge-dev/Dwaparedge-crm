"use client";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import { ClientPicker } from "@/components/common/ClientPicker";
import { FormShell } from "@/components/common/FormShell";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import { useFetch } from "@/components/common/useFetch";
import { useCurrentUser } from "@/components/layout/CurrentUserContext";
import { ApiError, api } from "@/lib/api-client";
import { plainText } from "@/lib/validation";
import type { CategoryRow, PriorityRow } from "../config-service";
import { canAssign, canManageTaskSettings } from "../policy";
import type { TaskRow } from "../queries";
import { QuickAddConfigDialog, type QuickKind } from "./QuickAddConfigDialog";

// Limits as in src/features/tasks/schema.ts: the server checks them again, this only saves a round trip. The title goes
// through the same plainText rule as the server's.
const DESCRIPTION_MAX = 5000;

const formSchema = z.object({
  title: plainText("Title", 200),
  description: z.string().max(DESCRIPTION_MAX, `Description can be at most ${DESCRIPTION_MAX} characters`),
  categoryId: z.string().min(1, "Choose a category"),
  priorityId: z.string().min(1, "Choose a priority"),
  /** `YYYY-MM-DD`, or blank for no date. */
  dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use a valid date"),
  clientId: z.string(),
  ownerId: z.string(),
});
type FormInput = z.input<typeof formSchema>;
type FormOutput = z.output<typeof formSchema>;
const FIELDS = Object.keys(formSchema.shape);

interface Option { id: string; name: string }

/** What a new task starts with when it is raised from another page (a client, a demo request). Ignored when editing. */
export interface TaskInitial {
  title?: string;
  description?: string;
  clientId?: string;
}

interface Props {
  /** The task to edit; leave out to create one. */
  task?: TaskRow;
  /** Starting values for a new task. */
  initial?: TaskInitial;
  onClose: () => void;
  onSaved: () => void;
}

interface FormProps extends Props {
  categories: Option[];
  priorities: (Option & { key: string })[];
  /** Active staff, for the owner picker; null when the user may not give tasks to anyone. */
  staff: Option[] | null;
  userId: string;
  /** Whether the user may add categories and priorities (tasks.manage_settings): then each picker ends with an Add option. */
  canAddConfig: boolean;
  nextRank: number;
}

/** The picker value that means "add a new one": it is never sent, the add dialog opens instead. */
const ADD_NEW = "__add_new__";

/** New task, or edit one. The pickers load first, so the form opens with its defaults in place. */
export function TaskFormDialog({ task, initial, onClose, onSaved }: Props) {
  const user = useCurrentUser();
  const assign = canAssign(user);
  const categories = useFetch<{ items: CategoryRow[] }>("/api/task-categories");
  const priorities = useFetch<{ items: PriorityRow[] }>("/api/task-priorities");
  const staff = useFetch<{ items: Option[] }>(assign ? "/api/users/options" : null);

  const error = categories.error ?? priorities.error ?? staff.error;
  if (!categories.data || !priorities.data || (assign && !staff.data) || error) {
    return <LoadingDialog error={error} onRetry={() => { categories.reload(); priorities.reload(); staff.reload(); }} onClose={onClose} />;
  }
  return <TaskForm task={task} initial={initial} onClose={onClose} onSaved={onSaved} categories={categories.data.items} priorities={priorities.data.items} staff={assign ? staff.data!.items : null} userId={user.id} canAddConfig={canManageTaskSettings(user)} nextRank={Math.min(99, Math.max(0, ...priorities.data.items.map((p) => p.rank)) + 1)} />;
}

function TaskForm({ task, initial, onClose, onSaved, categories: loadedCategories, priorities: loadedPriorities, staff, userId, canAddConfig, nextRank }: FormProps) {
  const [formError, setFormError] = useState<string | null>(null);
  // Ones added from this form are kept here, so they show in the picker without loading the lists again.
  const [addedCategories, setAddedCategories] = useState<Option[]>([]);
  const [addedPriorities, setAddedPriorities] = useState<(Option & { key: string })[]>([]);
  const [adding, setAdding] = useState<QuickKind | null>(null);
  const categories = [...loadedCategories, ...addedCategories];
  const priorities = [...loadedPriorities, ...addedPriorities];
  const defaultPriority = priorities.find((p) => p.key === "normal") ?? priorities[Math.floor(priorities.length / 2)];
  const { register, handleSubmit, control, setError, setValue, formState: { errors, isSubmitting } } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(formSchema),
    defaultValues: task
      ? {
          title: task.title, description: task.description ?? "", categoryId: task.category_id, priorityId: task.priority_id,
          dueDate: task.due_date ?? "", clientId: task.client_id ?? "", ownerId: task.owner_id ?? "",
        }
      : {
          title: initial?.title ?? "", description: initial?.description ?? "", categoryId: "", priorityId: defaultPriority?.id ?? "",
          dueDate: "", clientId: initial?.clientId ?? "", ownerId: userId,
        },
  });

  // A task can still point at a category or priority that has since been hidden: keep it selectable so the box is not blank.
  const withCurrent = (options: Option[], id: string | undefined, name: string | undefined) =>
    id && name && !options.some((o) => o.id === id) ? [...options, { id, name: `${name} (hidden)` }] : options;
  const categoryOptions = withCurrent(categories, task?.category_id, task?.category_name);
  const priorityOptions = withCurrent(priorities, task?.priority_id, task?.priority_name);

  async function submit(v: FormOutput) {
    setFormError(null);
    // Without tasks.assign the owner is not sent at all: a new task is the user's own, an edit leaves the owner as it is.
    const body = { ...v, ...(staff ? {} : { ownerId: undefined }) };
    try {
      if (task) await api(`/api/tasks/${task.id}`, { method: "PATCH", body });
      else await api("/api/tasks", { method: "POST", body });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        const unplaced: string[] = [];
        for (const issue of e.details.issues) {
          const field = String(issue.path[0] ?? "");
          if (FIELDS.includes(field)) setError(field as keyof FormInput, { message: issue.message });
          else unplaced.push(issue.message);
        }
        setFormError(unplaced.length ? unplaced.join(" ") : "Please fix the highlighted fields.");
        return;
      }
      setFormError(e instanceof Error ? e.message : "Could not save the task");
    }
  }

  const f = (name: keyof FormInput) => ({ error: Boolean(errors[name]), helperText: errors[name]?.message });

  return (
    <FormShell
      open title={task ? "Edit task" : "New task"} onClose={onClose} onSubmit={handleSubmit(submit)} maxWidth="sm"
      submitting={isSubmitting} submitLabel={task ? "Save changes" : "Create task"} error={formError}
    >
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField label="Title" required fullWidth autoFocus {...register("title")} {...f("title")} slotProps={{ htmlInput: { maxLength: 200 } }} />
        </Grid>
        <Grid size={12}>
          <TextField label="Description" fullWidth multiline minRows={3} placeholder="What needs doing, and anything worth remembering" {...register("description")} {...f("description")} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller name="categoryId" control={control} render={({ field }) => (
            <TextField select label="Category" required fullWidth {...field} onChange={(e) => (e.target.value === ADD_NEW ? setAdding("category") : field.onChange(e))} {...f("categoryId")}>
              {categoryOptions.map((c) => <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>)}
              {canAddConfig && <MenuItem value={ADD_NEW} sx={{ fontWeight: 600, color: "primary.main" }}>+ Add new category…</MenuItem>}
            </TextField>
          )} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <Controller name="priorityId" control={control} render={({ field }) => (
            <TextField select label="Priority" required fullWidth {...field} onChange={(e) => (e.target.value === ADD_NEW ? setAdding("priority") : field.onChange(e))} {...f("priorityId")}>
              {priorityOptions.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
              {canAddConfig && <MenuItem value={ADD_NEW} sx={{ fontWeight: 600, color: "primary.main" }}>+ Add new priority…</MenuItem>}
            </TextField>
          )} />
        </Grid>
        <Grid size={{ xs: 12, sm: staff ? 6 : 12 }}>
          <TextField label="Due date" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("dueDate")} {...f("dueDate")} helperText={errors.dueDate?.message ?? "Leave blank for no date"} />
        </Grid>
        {staff && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <Controller name="ownerId" control={control} render={({ field }) => (
              <TextField select label="Owner" fullWidth {...field} {...f("ownerId")}>
                <MenuItem value="">Unassigned</MenuItem>
                {staff.map((s) => <MenuItem key={s.id} value={s.id}>{s.id === userId ? `${s.name} (me)` : s.name}</MenuItem>)}
              </TextField>
            )} />
          </Grid>
        )}
        <Grid size={12}>
          <Controller name="clientId" control={control} render={({ field, fieldState }) => (
            <ClientPicker value={field.value} required={false} error={fieldState.error?.message} onChange={(id) => field.onChange(id)} />
          )} />
        </Grid>
      </Grid>
      {adding && (
        <QuickAddConfigDialog
          kind={adding} nextRank={nextRank} onClose={() => setAdding(null)}
          onCreated={(created) => {
            if (adding === "category") {
              setAddedCategories((list) => [...list, created]);
              setValue("categoryId", created.id, { shouldValidate: true });
            } else {
              setAddedPriorities((list) => [...list, { ...created, key: "" }]);
              setValue("priorityId", created.id, { shouldValidate: true });
            }
            setAdding(null);
          }}
        />
      )}
    </FormShell>
  );
}
