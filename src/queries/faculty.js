export const getMySchedulesQuery = `
    id,
    total_count,
    start_time,
    end_time,
    days,
    subjects (
        id, subject_code, subject
    ),
    room (
        id, room_title
    ),
    sections (
        id, name
    )
`;

export const getMyLoadQuery = `
  id,
  semester, 
  school_year,
  total_count,
  start_time,
  end_time,
  days,
  subjects (
    id, subject_code, subject, units
  ),
  room (
    id, room_id, room_title
  ),
  sections (
    id, name
  ),
  teacher_profile (
    id,
    departments (
      id, name
    )
  )
`;
