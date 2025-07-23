export const getMySchedulesQuery = `
    id,
    total_count,
    start_time,
    end_time,
    days,
    subjects:teacher_schedules_subject_id_fkey(
        id, subject_code, subject
    ),
    rooms:teacher_schedules_room_id_fkey(
        id, room_title
    ),
    sections:teacher_schedules_section_id_fkey(
        id, name
    )
`

export const getMyLoadQuery = `
  id,
  semester, 
  school_year,
  total_count,
  start_time,
  end_time,
  days,
  subjects:teacher_schedules_subject_id_fkey (
    id, subject_code, subject, units
  ),
  rooms:teacher_schedules_room_id_fkey (
    id, room_id
  ),
  sections:teacher_schedules_section_id_fkey (
    id, name
  ),
  teacher_profile:teacher_schedules_teacher_id_fkey (
    id,
    departments:user_roles_department_id_fkey    (
      id, name
    )
  )
`;
