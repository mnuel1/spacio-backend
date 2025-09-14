export const getFacultyQuery = `
  id,
  user_id,
  name,
  email,
  phone,
  status,
  birthdate,
  gender,
  civil_status,
  address,
  profile_image,
  created_at,
  teacher_profile:teacher_profile_user_id_fkey (
    id,
    salary_grade,
    contract_type,
    certifications,
    specializations,
    em_contact_name,
    em_contact_phone,
    em_contact_rs,
    current_load,
    avail_days,
    unavail_days,
    pref_time,
    qualifications,
    teacher_educations:teacher_profile_education_id_fkey (
      degree,
      area,
      program,
      school,
      year_grad
    ),
    teacher_schedules:teacher_schedules_teacher_id_fkey (
      id,
      subjects:teacher_schedules_subject_id_fkey (
        id,
        subject_code,
        subject,
        total_hours,
        units,
        semester,
        school_year
      )
    ),
    departments:user_roles_department_id_fkey (
      name
    ),
    positions:user_roles_position_id_fkey (
      position,
      max_load,
      min_load
    )
  )
`;

export const getSchedulesQuery = `
  id,
  current_load,
  contract_type,
  specializations,
  qualifications,
  avail_days,
  unavail_days,
  pref_time,
  user_profile:teacher_profile_user_id_fkey (
    id, user_id, name, email, profile_image, status
  ),
  positions:user_roles_position_id_fkey (
    id, position, max_load, min_load
  ),
  departments:user_roles_department_id_fkey (
    id, name
  ),
  created_at,
  teacher_schedules (
    id,
    subjects:teacher_schedules_subject_id_fkey (
      id, subject_code, subject, total_hours, units, semester, school_year
    ),
    section:teacher_schedules_section_id_fkey (
      id, name
    ),
    room:teacher_schedules_room_id_fkey (
      id, room_id, room_title, room_desc, status, floor
    ),
    days,
    start_time,
    end_time,
    total_duration,
    total_count,
    semester,
    school_year,
    created_at,
    updated_at
  )
`;

// id,
//   teacher_profile:teacher_schedules_teacher_id_fkey (
//     id,
//     current_load,
//     user_profile:teacher_profile_user_id_fkey (
//       id, name, email
//     ),
//     positions:user_roles_position_id_fkey (
//       id, position, max_load, min_load
//     ),
//     departments:user_roles_department_id_fkey (
//       id, name
//     ),
//     created_at
//   ),
//   subjects:teacher_schedules_subject_id_fkey (
//     id, subject_code, subject, total_hours, units, semester, school_year
//   ),
//   section:teacher_schedules_section_id_fkey (
//     id, name
//   ),
//   room:teacher_schedules_room_id_fkey (
//     id, room_id, room_title, room_desc, status, floor
//   ),
//   user_profile:teacher_schedules_created_by_fkey (
//     id, name
//   ),
//   days,
//   start_time,
//   end_time,
//   total_duration,
//   total_count,
//   semester,
//   school_year,
//   created_at,
//   updated_at

export const getLoadQuery = `
  id,
  days,
  start_time,
  end_time,
  total_count,
  total_duration,
  semester,
  school_year,
  teacher_profile:teacher_schedules_teacher_id_fkey (
    id,
    current_load,
    contract_type,
    specializations, 
    qualifications,
    avail_days,
    unavail_days,
    pref_time,
    user_profile:teacher_profile_user_id_fkey (
      id, user_id, name, email, profile_image, status
    ),
    positions:user_roles_position_id_fkey (
      id, position, max_load, min_load
    ),
    departments:user_roles_department_id_fkey (
      id, name
    ),
    created_at
  ),
  subjects:teacher_schedules_subject_id_fkey (
    id, subject_code, subject, total_hours, units, semester, school_year
  ),
  sections:teacher_schedules_section_id_fkey (
    id, name
  ),
  rooms:teacher_schedules_room_id_fkey (
    id, room_id, room_title, room_desc, status, floor
  )
`;

export const getUsersQuery = `
  id,
  user_id,
  role,
  name,
  email,
  phone,
  birthdate,
  gender,
  civil_status,
  address,
  profile_image,
  status,
  created_at,
  teacher_profile:teacher_profile_user_id_fkey (
    id,
    contract_type,
    em_contact_name,
    em_contact_phone,
    em_contact_rs,
    departments:user_roles_department_id_fkey (
      id, name
    ),
    positions:user_roles_position_id_fkey (
      id, position
    )
  )
`;
