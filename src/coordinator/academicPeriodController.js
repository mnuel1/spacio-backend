const supabase = require("../../supabase");
const { getCurrentAcademicPeriod } = require("../utils");

// Get current academic period
const getCurrentPeriod = async (req, res) => {
  try {
    const currentPeriod = await getCurrentAcademicPeriod(supabase);

    return res.status(200).json({
      title: "Success",
      message: "Current academic period retrieved successfully",
      data: currentPeriod,
    });
  } catch (error) {
    console.error("Error retrieving current academic period:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Get all academic periods
const getAcademicPeriods = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("academic_periods")
      .select(
        `
        *,
        created_by_profile:user_profile!academic_periods_created_by_fkey (
          id, name, email
        )
      `
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Academic periods retrieved successfully",
      data,
    });
  } catch (error) {
    console.error("Error retrieving academic periods:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Create new academic period
const createAcademicPeriod = async (req, res) => {
  try {
    const { semester, school_year, start_date, end_date, is_current } =
      req.body;

    // If this is set as current, unset all other current periods
    if (is_current) {
      await supabase
        .from("academic_periods")
        .update({ is_current: false })
        .neq("id", 0); // Update all records
    }

    const { data, error } = await supabase
      .from("academic_periods")
      .insert([
        {
          semester,
          school_year,
          start_date,
          end_date,
          is_current: is_current || false,
          status: "Planning",
          created_by: req.user?.id || null, // Assuming you have user in req from auth middleware
        },
      ])
      .select()
      .single();

    if (error) throw error;

    return res.status(201).json({
      title: "Success",
      message: "Academic period created successfully",
      data,
    });
  } catch (error) {
    console.error("Error creating academic period:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Set current academic period
const setCurrentPeriod = async (req, res) => {
  try {
    const { id } = req.params;

    // First, unset all current periods
    await supabase
      .from("academic_periods")
      .update({ is_current: false })
      .neq("id", 0);

    // Then set the specified period as current
    const { data, error } = await supabase
      .from("academic_periods")
      .update({ is_current: true, status: "Active" })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return res.status(200).json({
      title: "Success",
      message: "Current academic period updated successfully",
      data,
    });
  } catch (error) {
    console.error("Error setting current academic period:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Get officials board for current period
const getOfficialsBoard = async (req, res) => {
  try {
    const currentPeriod = await getCurrentAcademicPeriod(supabase);

    if (!currentPeriod.id) {
      return res.status(200).json({
        title: "Success",
        message: "No current academic period set",
        data: { officials: [], missingPositions: [] },
      });
    }

    // Get all positions
    const { data: positions, error: positionsError } = await supabase
      .from("academic_positions")
      .select("*")
      .order("position_level");

    if (positionsError) throw positionsError;

    // Get appointed officials for current period
    const { data: officials, error: officialsError } = await supabase
      .from("officials_board")
      .select(
        `
        *,
        position:academic_positions!officials_board_position_id_fkey (*),
        user:user_profile!officials_board_user_id_fkey (id, name, email, role),
        appointed_by_user:user_profile!officials_board_appointed_by_fkey (id, name, email)
      `
      )
      .eq("academic_period_id", currentPeriod.id)
      .eq("status", "Active");

    if (officialsError) throw officialsError;

    // Find missing positions
    const appointedPositionIds = officials.map((o) => o.position_id);
    const missingPositions = positions.filter(
      (p) => !appointedPositionIds.includes(p.id)
    );

    return res.status(200).json({
      title: "Success",
      message: "Officials board retrieved successfully",
      data: {
        currentPeriod,
        officials,
        missingPositions,
        isComplete: missingPositions.length === 0,
      },
    });
  } catch (error) {
    console.error("Error retrieving officials board:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Appoint official to position
const appointOfficial = async (req, res) => {
  try {
    const { position_id, user_id, notes } = req.body;
    const currentPeriod = await getCurrentAcademicPeriod(supabase);

    if (!currentPeriod.id) {
      return res.status(400).json({
        title: "Failed",
        message: "No current academic period set",
        data: null,
      });
    }

    const { data, error } = await supabase
      .from("officials_board")
      .upsert(
        [
          {
            academic_period_id: currentPeriod.id,
            position_id,
            user_id,
            notes,
            appointed_by: req.user?.id || null,
            status: "Active",
          },
        ],
        {
          onConflict: "academic_period_id,position_id",
        }
      )
      .select(
        `
        *,
        position:academic_positions!officials_board_position_id_fkey (*),
        user:user_profile!officials_board_user_id_fkey (id, name, email, role)
      `
      )
      .single();

    if (error) throw error;

    return res.status(201).json({
      title: "Success",
      message: "Official appointed successfully",
      data,
    });
  } catch (error) {
    console.error("Error appointing official:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

// Debug endpoint to check current period and schedules
const debugCurrentPeriod = async (req, res) => {
  try {
    const currentPeriod = await getCurrentAcademicPeriod(supabase);

    // Get total schedules in system
    const { data: allSchedules, error: allError } = await supabase
      .from("teacher_schedules")
      .select("id, semester, school_year, academic_period_id");

    if (allError) throw allError;

    // Get schedules for current period
    let currentPeriodSchedules = [];
    if (currentPeriod.id) {
      const { data: periodSchedules, error: periodError } = await supabase
        .from("teacher_schedules")
        .select("id, semester, school_year, academic_period_id")
        .eq("academic_period_id", currentPeriod.id);

      if (!periodError) currentPeriodSchedules = periodSchedules;
    } else {
      const { data: periodSchedules, error: periodError } = await supabase
        .from("teacher_schedules")
        .select("id, semester, school_year, academic_period_id")
        .eq("semester", currentPeriod.semester)
        .eq("school_year", currentPeriod.school_year);

      if (!periodError) currentPeriodSchedules = periodSchedules;
    }

    // Get subjects for current period
    let currentPeriodSubjects = [];
    if (currentPeriod.id) {
      const { data: subjects, error: subError } = await supabase
        .from("subjects")
        .select("id, subject_code, semester, school_year, academic_period_id")
        .eq("academic_period_id", currentPeriod.id);

      if (!subError) currentPeriodSubjects = subjects;
    } else {
      const { data: subjects, error: subError } = await supabase
        .from("subjects")
        .select("id, subject_code, semester, school_year, academic_period_id")
        .eq("semester", currentPeriod.semester)
        .eq("school_year", currentPeriod.school_year);

      if (!subError) currentPeriodSubjects = subjects;
    }

    return res.status(200).json({
      title: "Debug Info",
      message: "Current period debug information",
      data: {
        currentPeriod,
        totalSchedulesInSystem: allSchedules.length,
        schedulesForCurrentPeriod: currentPeriodSchedules.length,
        subjectsForCurrentPeriod: currentPeriodSubjects.length,
        allSchedulesSample: allSchedules.slice(0, 5),
        currentPeriodSchedulesSample: currentPeriodSchedules.slice(0, 5),
        currentPeriodSubjectsSample: currentPeriodSubjects.slice(0, 5),
      },
    });
  } catch (error) {
    console.error("Debug error:", error.message);
    return res.status(500).json({
      title: "Failed",
      message: "Debug failed",
      data: null,
    });
  }
};

module.exports = {
  getCurrentPeriod,
  getAcademicPeriods,
  createAcademicPeriod,
  setCurrentPeriod,
  getOfficialsBoard,
  appointOfficial,
  debugCurrentPeriod,
};
