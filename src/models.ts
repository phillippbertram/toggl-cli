import {z} from 'zod';

const nullableNumber = z.number().nullable().optional();
const nullableString = z.string().nullable().optional();

export const UserSchema = z
  .object({
    id: z.number(),
    email: z.string().email(),
    fullname: z.string().default(''),
    timezone: z.string().min(1).default('Etc/UTC'),
    default_workspace_id: nullableNumber,
  })
  .passthrough();

export type TogglUser = z.infer<typeof UserSchema>;

export const WorkspaceSchema = z
  .object({
    id: z.number(),
    name: z.string().min(1),
  })
  .passthrough();

export type Workspace = z.infer<typeof WorkspaceSchema>;

export const ProjectSchema = z
  .object({
    id: z.number(),
    name: z.string().min(1),
    workspace_id: z.number().optional(),
    wid: z.number().optional(),
    active: z.boolean().default(true),
    can_track_time: z.boolean().default(true),
  })
  .passthrough();

export type Project = z.infer<typeof ProjectSchema>;

export const TimeEntrySchema = z
  .object({
    id: z.number(),
    workspace_id: z.number().optional(),
    wid: z.number().optional(),
    project_id: nullableNumber,
    pid: nullableNumber,
    project_name: nullableString,
    description: nullableString,
    start: z.string().min(1),
    stop: nullableString,
    duration: z.number(),
  })
  .passthrough();

export type TimeEntry = z.infer<typeof TimeEntrySchema>;

export const ReportRowSchema = z
  .object({
    id: z.number(),
    description: nullableString,
    project_id: nullableNumber,
    start: z.string().min(1),
    stop: nullableString,
    seconds: z.number().nonnegative().optional(),
  })
  .passthrough();

export type ReportRow = z.infer<typeof ReportRowSchema>;

const ReportTimeEntrySchema = z
  .object({
    id: z.number(),
    start: z.string().min(1),
    stop: nullableString,
    seconds: z.number().nonnegative(),
  })
  .passthrough();

const ReportGroupSchema = z
  .object({
    description: nullableString,
    project_id: nullableNumber,
    time_entries: z.array(ReportTimeEntrySchema),
  })
  .passthrough();

export const WorkspaceListSchema = z.union([
  z.array(WorkspaceSchema),
  z.object({items: z.array(WorkspaceSchema)}).transform((value) => value.items),
]);

export const ProjectListSchema = z.union([
  z.array(ProjectSchema),
  z.object({items: z.array(ProjectSchema)}).transform((value) => value.items),
]);

export const TimeEntryListSchema = z.union([
  z.array(TimeEntrySchema),
  z.object({items: z.array(TimeEntrySchema)}).transform((value) => value.items),
]);

export const CurrentTimeEntrySchema = z.union([
  TimeEntrySchema,
  z.null(),
  z
    .object({})
    .strict()
    .transform(() => null),
  z.tuple([]).transform(() => null),
  z.object({data: TimeEntrySchema.nullable()}).transform((value) => value.data),
]);

const ReportResultListSchema = z
  .array(z.union([ReportRowSchema, ReportGroupSchema]))
  .transform((items) =>
    items.flatMap((item) => {
      const group = ReportGroupSchema.safeParse(item);
      if (group.success) {
        return group.data.time_entries.map((timeEntry) => ({
          ...timeEntry,
          description: group.data.description,
          project_id: group.data.project_id,
        }));
      }
      return [ReportRowSchema.parse(item)];
    }),
  );

export const ReportRowListSchema = z.union([
  ReportResultListSchema,
  z.object({items: ReportResultListSchema}).transform((value) => value.items),
]);

export const timeEntryWorkspaceId = (entry: TimeEntry): number | undefined =>
  entry.workspace_id ?? entry.wid;

export const timeEntryProjectId = (entry: TimeEntry): number | null =>
  entry.project_id ?? entry.pid ?? null;

export const timeEntryDescription = (entry: TimeEntry): string =>
  entry.description?.trim() || 'Untitled';
