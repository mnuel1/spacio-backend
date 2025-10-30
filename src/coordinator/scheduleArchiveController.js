const supabase = require("../supabase");

/**
 * Get all archived schedules with optional filtering
 * GET /coordinator/schedule/archive
 */
const getArchivedSchedules = async (req, res) => {
  try {
    const {
      teacher_id,
      academic_period_id,
      semester,
      school_year,
      is_active,
      page = 1,
      limit = 50,
      search,
    } = req.query;

    let query = supabase
      .from("teacher_schedules_archive")
      .select(
        `
        *,
        teacher_profile!inner (
          id,
          user_id,
          current_load,
          user_profile!inner (
            id,
            name,
            email,
            profile_image
          )
        ),
        academic_periods!inner (
          id,
          semester,
          school_year,
          start_date,
          end_date,
          is_current,
          status
        ),
        archived_by_user:user_profile!teacher_schedules_archive_archived_by_fkey (
          id,
          name,
          email
        ),
        last_reused_by_user:user_profile!teacher_schedules_archive_last_reused_by_fkey (
          id,
          name,
          email
        )
      `
      )
      .order("archived_at", { ascending: false });

    // Apply filters
    if (teacher_id) query = query.eq("teacher_id", teacher_id);
    if (academic_period_id)
      query = query.eq("academic_period_id", academic_period_id);
    if (semester) query = query.eq("semester", semester);
    if (school_year) query = query.eq("school_year", school_year);
    if (is_active !== undefined)
      query = query.eq("is_active", is_active === "true");

    // Search by teacher name or notes
    if (search) {
      query = query.or(`notes.ilike.%${search}%`);
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    // Transform data to match frontend expectations
    const transformedData = data.map((archive) => ({
      id: archive.id,
      teacher_id: archive.teacher_id,
      academic_period_id: archive.academic_period_id,
      semester: archive.semester,
      school_year: archive.school_year,
      schedule_data: archive.schedule_data,
      archived_at: archive.archived_at,
      archived_by: archive.archived_by,
      archived_by_name: archive.archived_by_user?.name || null,
      notes: archive.notes,
      is_active: archive.is_active,
      reused_count: archive.reused_count || 0,
      last_reused_at: archive.last_reused_at,
      last_reused_by: archive.last_reused_by,
      last_reused_by_name: archive.last_reused_by_user?.name || null,
      created_at: archive.created_at,
      updated_at: archive.updated_at,
      teacher_name: archive.teacher_profile?.user_profile?.name || "",
      teacher_email: archive.teacher_profile?.user_profile?.email || "",
      academic_period: archive.academic_periods,
    }));

    return res.status(200).json({
      title: "Success",
      message: "Archived schedules retrieved successfully.",
      data: transformedData,
      pagination: {
        total: count || transformedData.length,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil((count || transformedData.length) / limit),
      },
    });
  } catch (error) {
    console.error("Error retrieving archived schedules:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Get single archived schedule by ID
 * GET /coordinator/schedule/archive/:id
 */
const getArchivedScheduleById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("teacher_schedules_archive")
      .select(
        `
        *,
        teacher_profile!inner (
          id,
          user_id,
          current_load,
          user_profile!inner (
            id,
            name,
            email,
            profile_image
          )
        ),
        academic_periods!inner (
          id,
          semester,
          school_year,
          start_date,
          end_date,
          is_current,
          status
        ),
        archived_by_user:user_profile!teacher_schedules_archive_archived_by_fkey (
          id,
          name,
          email
        ),
        last_reused_by_user:user_profile!teacher_schedules_archive_last_reused_by_fkey (
          id,
          name,
          email
        )
      `
      )
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        title: "Not Found",
        message: "Archive not found.",
        data: null,
      });
    }

    const transformedData = {
      id: data.id,
      teacher_id: data.teacher_id,
      academic_period_id: data.academic_period_id,
      semester: data.semester,
      school_year: data.school_year,
      schedule_data: data.schedule_data,
      archived_at: data.archived_at,
      archived_by: data.archived_by,
      archived_by_name: data.archived_by_user?.name || null,
      notes: data.notes,
      is_active: data.is_active,
      reused_count: data.reused_count || 0,
      last_reused_at: data.last_reused_at,
      last_reused_by: data.last_reused_by,
      last_reused_by_name: data.last_reused_by_user?.name || null,
      created_at: data.created_at,
      updated_at: data.updated_at,
      teacher_name: data.teacher_profile?.user_profile?.name || "",
      teacher_email: data.teacher_profile?.user_profile?.email || "",
      academic_period: data.academic_periods,
    };

    return res.status(200).json({
      title: "Success",
      message: "Archive retrieved successfully.",
      data: transformedData,
    });
  } catch (error) {
    console.error("Error retrieving archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Create new archive
 * POST /coordinator/schedule/archive
 */
const createArchive = async (req, res) => {
  try {
    const {
      teacher_id,
      academic_period_id,
      semester,
      school_year,
      schedule_ids,
      notes,
      archived_by,
    } = req.body;

    if (!teacher_id || !academic_period_id || !semester || !school_year) {
      return res.status(400).json({
        title: "Failed",
        message:
          "Missing required fields: teacher_id, academic_period_id, semester, school_year",
        data: null,
      });
    }

    // Check if archive already exists
    const { data: existingArchive } = await supabase
      .from("teacher_schedules_archive")
      .select("id")
      .eq("teacher_id", teacher_id)
      .eq("academic_period_id", academic_period_id)
      .single();

    if (existingArchive) {
      return res.status(409).json({
        title: "Failed",
        message:
          "An archive already exists for this teacher and academic period.",
        data: null,
      });
    }

    // First, check what schedules exist for this teacher to help with debugging
    const { data: allTeacherSchedules } = await supabase
      .from("teacher_schedules")
      .select("id, semester, school_year, academic_period_id")
      .eq("teacher_id", teacher_id);

    // Fetch schedules to archive
    let scheduleQuery = supabase
      .from("teacher_schedules")
      .select(
        `
        *,
        subjects (
          id,
          subject_code,
          subject,
          units,
          total_hours,
          specialization
        ),
        room (
          id,
          room_id,
          room_title,
          room_desc,
          floor,
          type
        ),
        sections (
          id,
          name,
          semester,
          year
        )
      `
      )
      .eq("teacher_id", teacher_id);

    // If specific schedule IDs provided, filter by them
    if (schedule_ids && schedule_ids.length > 0) {
      scheduleQuery = scheduleQuery.in("id", schedule_ids);
    } else {
      // Prioritize academic_period_id if available, otherwise use semester and school_year
      if (academic_period_id) {
        // Try to match by academic_period_id first, then fall back to semester/year
        scheduleQuery = scheduleQuery.or(
          `academic_period_id.eq.${academic_period_id},and(semester.eq."${semester}",school_year.eq."${school_year}")`
        );
      } else {
        // Only filter by semester and school_year if academic_period_id is not provided
        scheduleQuery = scheduleQuery
          .eq("semester", semester)
          .eq("school_year", school_year);
      }
    }

    const { data: schedules, error: schedulesError } = await scheduleQuery;

    if (schedulesError) {
      console.error("Schedule query error:", schedulesError);
      throw schedulesError;
    }

    console.log("Found schedules:", schedules?.length || 0);

    if (!schedules || schedules.length === 0) {
      return res.status(404).json({
        title: "Failed",
        message: `No schedules found for this teacher in the specified period. Found ${
          allTeacherSchedules?.length || 0
        } total schedules for this teacher.`,
        data: null,
      });
    }

    // Transform schedules to archive format
    const scheduleData = schedules.map((schedule) => ({
      id: schedule.id,
      subject_id: schedule.subject_id,
      room_id: schedule.room_id,
      section_id: schedule.section_id,
      start_time: schedule.start_time,
      end_time: schedule.end_time,
      days: schedule.days,
      total_count: schedule.total_count,
      total_duration: schedule.total_duration,
      subject: schedule.subjects,
      room: schedule.room,
      section: schedule.sections,
    }));

    // Create archive
    const { data: archive, error: archiveError } = await supabase
      .from("teacher_schedules_archive")
      .insert({
        teacher_id,
        academic_period_id,
        semester,
        school_year,
        schedule_data: scheduleData,
        notes: notes || null,
        archived_by: archived_by || null,
      })
      .select()
      .single();

    if (archiveError) throw archiveError;

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Archived schedule for teacher ${teacher_id}, period ${academic_period_id} (${scheduleData.length} schedules)`,
      by: archived_by || null,
    });

    return res.status(201).json({
      title: "Success",
      message: `Successfully archived ${scheduleData.length} schedule(s).`,
      data: archive,
    });
  } catch (error) {
    console.error("Error creating archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Bulk create archives for multiple teachers
 * POST /coordinator/schedule/archive/bulk
 */
const bulkCreateArchive = async (req, res) => {
  try {
    const {
      academic_period_id,
      semester,
      school_year,
      teacher_ids,
      notes,
      archived_by,
    } = req.body;

    if (!academic_period_id || !semester || !school_year) {
      return res.status(400).json({
        title: "Failed",
        message:
          "Missing required fields: academic_period_id, semester, school_year",
        data: null,
      });
    }

    // Get all teachers with schedules in this period
    let teacherQuery = supabase
      .from("teacher_schedules")
      .select("teacher_id")
      .eq("academic_period_id", academic_period_id);

    if (teacher_ids && teacher_ids.length > 0) {
      teacherQuery = teacherQuery.in("teacher_id", teacher_ids);
    }

    const { data: teacherSchedules, error: queryError } = await teacherQuery;

    if (queryError) throw queryError;

    // Get unique teacher IDs
    const uniqueTeacherIds = [
      ...new Set(teacherSchedules.map((ts) => ts.teacher_id)),
    ];

    const archivedTeacherIds = [];
    const errors = [];

    // Create archive for each teacher
    for (const teacherId of uniqueTeacherIds) {
      try {
        // Check if archive exists
        const { data: existing } = await supabase
          .from("teacher_schedules_archive")
          .select("id")
          .eq("teacher_id", teacherId)
          .eq("academic_period_id", academic_period_id)
          .single();

        if (existing) {
          errors.push({
            teacher_id: teacherId,
            reason: "Archive already exists",
          });
          continue;
        }

        // Fetch schedules
        const { data: schedules, error: schedError } = await supabase
          .from("teacher_schedules")
          .select(
            `
            *,
            subjects (*),
            room (*),
            sections (*)
          `
          )
          .eq("teacher_id", teacherId)
          .eq("academic_period_id", academic_period_id);

        if (schedError || !schedules || schedules.length === 0) {
          errors.push({
            teacher_id: teacherId,
            reason: "No schedules found",
          });
          continue;
        }

        // Transform schedules
        const scheduleData = schedules.map((schedule) => ({
          id: schedule.id,
          subject_id: schedule.subject_id,
          room_id: schedule.room_id,
          section_id: schedule.section_id,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          days: schedule.days,
          total_count: schedule.total_count,
          total_duration: schedule.total_duration,
          subject: schedule.subjects,
          room: schedule.room,
          section: schedule.sections,
        }));

        // Create archive
        const { error: archError } = await supabase
          .from("teacher_schedules_archive")
          .insert({
            teacher_id: teacherId,
            academic_period_id,
            semester,
            school_year,
            schedule_data: scheduleData,
            notes: notes || null,
            archived_by: archived_by || null,
          });

        if (archError) {
          errors.push({
            teacher_id: teacherId,
            reason: archError.message,
          });
        } else {
          archivedTeacherIds.push(teacherId);
        }
      } catch (err) {
        errors.push({
          teacher_id: teacherId,
          reason: err.message,
        });
      }
    }

    // Log activity
    if (archivedTeacherIds.length > 0) {
      await supabase.from("activity_logs").insert({
        activity: `Bulk archived schedules for ${archivedTeacherIds.length} teachers in period ${academic_period_id}`,
        by: archived_by || null,
      });
    }

    return res.status(201).json({
      title: "Success",
      message: `Archived ${archivedTeacherIds.length} teacher schedule(s).`,
      data: {
        archived_count: archivedTeacherIds.length,
        skipped_count: errors.length,
        archived_teacher_ids: archivedTeacherIds,
        errors,
      },
    });
  } catch (error) {
    console.error("Error in bulk archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Restore archive to new period
 * POST /coordinator/schedule/archive/:id/restore
 */
const restoreArchive = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      target_academic_period_id,
      target_semester,
      target_school_year,
      overwrite_existing,
      section_mapping,
      room_mapping,
      restored_by,
    } = req.body;

    if (!target_academic_period_id || !target_semester || !target_school_year) {
      return res.status(400).json({
        title: "Failed",
        message:
          "Missing required fields: target_academic_period_id, target_semester, target_school_year",
        data: null,
      });
    }

    // Fetch archive
    const { data: archive, error: archiveError } = await supabase
      .from("teacher_schedules_archive")
      .select("*")
      .eq("id", id)
      .single();

    if (archiveError || !archive) {
      return res.status(404).json({
        title: "Failed",
        message: "Archive not found.",
        data: null,
      });
    }

    const scheduleData = archive.schedule_data;

    // If overwrite, delete existing schedules
    if (overwrite_existing) {
      await supabase
        .from("teacher_schedules")
        .delete()
        .eq("teacher_id", archive.teacher_id)
        .eq("academic_period_id", target_academic_period_id);
    }

    const createdScheduleIds = [];
    const conflicts = [];

    // Restore each schedule
    for (const schedule of scheduleData) {
      try {
        // Map section ID if mapping provided
        const sectionId =
          section_mapping?.[schedule.section_id] || schedule.section_id;

        // Map room ID if mapping provided
        const roomId = room_mapping?.[schedule.room_id] || schedule.room_id;

        // Create new schedule
        const { data: newSchedule, error: createError } = await supabase
          .from("teacher_schedules")
          .insert({
            teacher_id: archive.teacher_id,
            subject_id: schedule.subject_id,
            room_id: roomId,
            section_id: sectionId,
            start_time: schedule.start_time,
            end_time: schedule.end_time,
            days: schedule.days,
            total_count: schedule.total_count,
            semester: target_semester,
            school_year: target_school_year,
            academic_period_id: target_academic_period_id,
            created_by: restored_by || null,
          })
          .select("id")
          .single();

        if (createError) {
          conflicts.push({
            original_schedule_id: schedule.id,
            reason: createError.message,
          });
        } else {
          createdScheduleIds.push(newSchedule.id);
        }
      } catch (err) {
        conflicts.push({
          original_schedule_id: schedule.id,
          reason: err.message,
        });
      }
    }

    // Update archive reuse statistics
    await supabase
      .from("teacher_schedules_archive")
      .update({
        reused_count: (archive.reused_count || 0) + 1,
        last_reused_at: new Date().toISOString(),
        last_reused_by: restored_by || null,
      })
      .eq("id", id);

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Restored archive ${id} to period ${target_academic_period_id} (${createdScheduleIds.length} schedules created)`,
      by: restored_by || null,
    });

    return res.status(201).json({
      title: "Success",
      message: `Restored ${createdScheduleIds.length} schedule(s) successfully.`,
      data: {
        created_count: createdScheduleIds.length,
        skipped_count: conflicts.length,
        created_schedule_ids: createdScheduleIds,
        conflicts,
      },
    });
  } catch (error) {
    console.error("Error restoring archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Preview restore operation
 * GET /coordinator/schedule/archive/:archiveId/preview/:targetPeriodId
 */
const previewRestore = async (req, res) => {
  try {
    const { archiveId, targetPeriodId } = req.params;

    // Fetch archive
    const { data: archive, error: archiveError } = await supabase
      .from("teacher_schedules_archive")
      .select("*")
      .eq("id", archiveId)
      .single();

    if (archiveError || !archive) {
      return res.status(404).json({
        title: "Failed",
        message: "Archive not found.",
        data: null,
      });
    }

    const scheduleData = archive.schedule_data;

    // Calculate statistics
    const scheduleCount = scheduleData.length;
    const totalLoad = scheduleData.reduce(
      (sum, s) => sum + (s.subject?.units || 0),
      0
    );
    const subjects = [
      ...new Set(scheduleData.map((s) => s.subject?.subject || "Unknown")),
    ];
    const roomsNeeded = [
      ...new Set(scheduleData.map((s) => s.room?.room_title || "Unassigned")),
    ];

    // Check for potential conflicts
    const potentialConflicts = [];

    // Check if sections exist in target period
    for (const schedule of scheduleData) {
      const { data: sectionExists } = await supabase
        .from("sections")
        .select("id")
        .eq("id", schedule.section_id)
        .eq("academic_period_id", targetPeriodId)
        .single();

      if (!sectionExists) {
        potentialConflicts.push(
          `Section "${schedule.section?.name}" not found in target period`
        );
      }
    }

    return res.status(200).json({
      title: "Success",
      message: "Preview generated successfully.",
      data: {
        schedule_count: scheduleCount,
        total_load: totalLoad,
        subjects,
        rooms_needed: roomsNeeded,
        potential_conflicts: [...new Set(potentialConflicts)],
      },
    });
  } catch (error) {
    console.error("Error previewing restore:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Update archive
 * PUT /coordinator/schedule/archive/:id
 */
const updateArchive = async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, is_active } = req.body;

    const updateData = {};
    if (notes !== undefined) updateData.notes = notes;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data, error } = await supabase
      .from("teacher_schedules_archive")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({
        title: "Failed",
        message: "Archive not found.",
        data: null,
      });
    }

    return res.status(200).json({
      title: "Success",
      message: "Archive updated successfully.",
      data,
    });
  } catch (error) {
    console.error("Error updating archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Delete archive
 * DELETE /coordinator/schedule/archive/:id
 */
const deleteArchive = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("teacher_schedules_archive")
      .delete()
      .eq("id", id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({
        title: "Failed",
        message: "Archive not found.",
        data: null,
      });
    }

    // Log activity
    await supabase.from("activity_logs").insert({
      activity: `Deleted archive ${id}`,
      by: req.body.deleted_by || null,
    });

    return res.status(200).json({
      title: "Success",
      message: "Archive deleted successfully.",
      data: null,
    });
  } catch (error) {
    console.error("Error deleting archive:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

/**
 * Get archive statistics
 * GET /coordinator/schedule/archive/statistics
 */
const getArchiveStatistics = async (req, res) => {
  try {
    // Total archives
    const { count: totalArchives } = await supabase
      .from("teacher_schedules_archive")
      .select("*", { count: "exact", head: true });

    // Unique teachers with archives
    const { data: uniqueTeachers } = await supabase
      .from("teacher_schedules_archive")
      .select("teacher_id");

    const totalTeachersWithArchives = new Set(
      uniqueTeachers?.map((a) => a.teacher_id) || []
    ).size;

    // Total semesters archived
    const { data: semesters } = await supabase
      .from("teacher_schedules_archive")
      .select("semester, school_year");

    const totalSemestersArchived = new Set(
      semesters?.map((s) => `${s.semester}-${s.school_year}`) || []
    ).size;

    // Most reused archive
    const { data: mostReused } = await supabase
      .from("teacher_schedules_archive")
      .select("*, teacher_profile!inner(user_profile!inner(name, email))")
      .order("reused_count", { ascending: false })
      .limit(1)
      .single();

    // Recent archives
    const { data: recentArchives } = await supabase
      .from("teacher_schedules_archive")
      .select("*, teacher_profile!inner(user_profile!inner(name, email))")
      .order("archived_at", { ascending: false })
      .limit(5);

    // Archives by semester
    const archivesBySemester = {};
    if (semesters) {
      semesters.forEach((s) => {
        const key = `${s.semester} ${s.school_year}`;
        archivesBySemester[key] = (archivesBySemester[key] || 0) + 1;
      });
    }

    return res.status(200).json({
      title: "Success",
      message: "Statistics retrieved successfully.",
      data: {
        total_archives: totalArchives || 0,
        total_teachers_with_archives: totalTeachersWithArchives,
        total_semesters_archived: totalSemestersArchived,
        most_reused_archive: mostReused || null,
        recent_archives: recentArchives || [],
        archives_by_semester: archivesBySemester,
      },
    });
  } catch (error) {
    console.error("Error retrieving statistics:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

module.exports = {
  getArchivedSchedules,
  getArchivedScheduleById,
  createArchive,
  bulkCreateArchive,
  restoreArchive,
  previewRestore,
  updateArchive,
  deleteArchive,
  getArchiveStatistics,
};
