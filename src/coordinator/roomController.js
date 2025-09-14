const supabase = require("../supabase");

const getRooms = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("room")
      .select(
        `
        *, 
        departments:room_department_id_fkey (
          name
        ),
        teacher_schedules:teacher_schedules_room_id_fkey (
          id,
          days,
          end_time,
          start_time,
          semester,
          subject_id,
          subjects:teacher_schedules_subject_id_fkey (
            subject
          ),
          teachers_profile:teacher_schedules_teacher_id_fkey (
            user_id,
            user_profile:teacher_profile_user_id_fkey(
              name
            )
          ),
          created_by,
          created_at,
          updated_at
        )        
      `
      )
      .neq("status", "Inactive");

    if (error) throw error;

    const dayMap = {
      M: "Monday",
      T: "Tuesday",
      W: "Wednesday",
      Th: "Thursday",
      F: "Friday",
      S: "Saturday",
      Su: "Sunday",
    };

    const todayName = new Date().toLocaleDateString("en-US", {
      weekday: "long",
    });

    const getDayOfWeek = (abbrev) => {
      if (!abbrev) return "";

      const dayCodes = ["Su", "M", "T", "W", "Th", "F", "S"];
      const dayMap = {
        Su: "Sunday",
        M: "Monday",
        T: "Tuesday",
        W: "Wednesday",
        Th: "Thursday",
        F: "Friday",
        S: "Saturday",
      };

      const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
      const todayCode = Object.entries(dayMap).find(
        ([code, name]) => name === today
      )?.[0];

      const detectedCodes = [];
      for (let i = 0; i < abbrev.length; i++) {
        const ch = abbrev[i];
        if (ch === "T" && abbrev[i + 1] === "h") {
          detectedCodes.push("Th");
          i++;
        } else if (ch === "S" && abbrev[i + 1] === "u") {
          detectedCodes.push("Su");
          i++;
        } else {
          detectedCodes.push(ch);
        }
      }

      if (detectedCodes.includes(todayCode)) {
        return dayMap[todayCode];
      }

      return dayMap[detectedCodes[0]] || "";
    };

    const formatTime = (time) => time?.slice(0, 5); // "13:00:00" → "13:00"

    const calculateHours = (start, end) => {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      return Math.round(((eh * 60 + em - (sh * 60 + sm)) / 60) * 10) / 10;
    };

    const formattedRooms = data.map((room) => {
      const todaySchedules = room.teacher_schedules.filter((sched) => {
        // Check if today's day is included in the 'days' string (e.g., "MWF")
        if (!sched.days) return false;
        const dayMatch =
          todayName === "Thursday"
            ? sched.days.includes("Th")
            : sched.days.includes(todayName[0]);
        return dayMatch;
      });

      const formattedSchedules = room.teacher_schedules.map((sched) => {
        const professorName =
          sched.teachers_profile?.user_profile?.name || "N/A";
        const subjectName = sched.subjects?.subject || "N/A";

        return {
          id: sched.id,
          subjectName,
          professor: professorName,
          startTime: formatTime(sched.start_time),
          endTime: formatTime(sched.end_time),
          hour: calculateHours(sched.start_time, sched.end_time),
          dayOfWeek: getDayOfWeek(sched.days),
          roomId: room.room_id,
        };
      });

      const currentSchedule =
        todaySchedules.length > 0
          ? {
              id: todaySchedules[0].id,
              subjectName: todaySchedules[0].subjects?.subject || "N/A",
              professor:
                todaySchedules[0].teachers_profile?.user_profile?.name || "N/A",
              startTime: formatTime(todaySchedules[0].start_time),
              endTime: formatTime(todaySchedules[0].end_time),
              hour: calculateHours(
                todaySchedules[0].start_time,
                todaySchedules[0].end_time
              ),
              dayOfWeek: getDayOfWeek(todaySchedules[0].days),
              roomId: room.room_id,
            }
          : null;

      return {
        id: room.id,
        roomId: room.room_id || `R${room.id}`, // Fallback to R + id if room_id is null
        roomTitle: room.room_title,
        roomDescription: room.room_desc,
        department: room.departments?.name || "N/A",
        floor: room.floor,
        type: room.type,
        roomStatus: room.status,
        created_at: room.created_at,
        currentSchedule,
        schedules: formattedSchedules,
      };
    });

    return res.status(200).json({
      title: "Success",
      message: "Rooms fetched successfully.",
      data: formattedRooms,
    });
  } catch (error) {
    console.error("Error fetching rooms:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};

const createRoom = async (req, res) => {
  try {
    const { room_title, room_desc, floor, department_id, type, user_id } =
      req.body;

    // Generate room_id based on type and existing rooms
    let roomTypePrefix = "";
    switch (type) {
      case "Lab":
        roomTypePrefix = "LAB";
        break;
      case "Lec":
        roomTypePrefix = "LEC";
        break;
      case "Conf":
        roomTypePrefix = "CONF";
        break;
      case "Office":
        roomTypePrefix = "OFF";
        break;
      default:
        roomTypePrefix = "ROOM";
    }

    // Get existing rooms of the same type to find next number
    const { data: existingTypeRooms, error: typeError } = await supabase
      .from("room")
      .select("room_id")
      .ilike("room_id", `${roomTypePrefix}%`)
      .order("room_id", { ascending: false });

    if (typeError) throw typeError;

    // Find the next available number for this type
    let nextNumber = 1;
    if (existingTypeRooms.length > 0) {
      const numbers = existingTypeRooms
        .map((room) => {
          const match = room.room_id?.match(
            new RegExp(`^${roomTypePrefix}(\\d+)$`)
          );
          return match ? parseInt(match[1], 10) : 0;
        })
        .filter((num) => num > 0)
        .sort((a, b) => b - a);

      if (numbers.length > 0) {
        nextNumber = numbers[0] + 1;
      }
    }

    const roomID = `${roomTypePrefix}${nextNumber}`;

    // Get the next available ID manually
    const { data: maxIdResult } = await supabase
      .from("room")
      .select("id")
      .order("id", { ascending: false })
      .limit(1);

    const nextId = (maxIdResult?.[0]?.id || 0) + 1;

    // Try insert with explicit ID first
    let { data, error } = await supabase
      .from("room")
      .insert({
        id: nextId,
        room_id: roomID,
        room_title,
        room_desc,
        floor,
        department_id,
        type,
        status: "Active", // Automatically set status to Active
        created_at: new Date().toISOString(),
      })
      .select();

    if (error && error.code === "23505") {
      // If ID conflict, try without explicit ID (let auto-increment handle it)
      const result = await supabase
        .from("room")
        .insert({
          room_id: roomID,
          room_title,
          room_desc,
          floor,
          department_id,
          type,
          status: "Active", // Automatically set status to Active
          created_at: new Date().toISOString(),
        })
        .select();

      data = result.data;
      error = result.error;
    }

    if (error) {
      console.error("Insert error details:", error);
      throw error;
    }

    await supabase.from("activity_logs").insert({
      activity: `Created room "${room_title}" (${room_desc}) on floor ${floor} for department ${department_id}`,
      by: user_id ?? null,
    });

    return res.status(201).json({
      title: "Success",
      message: "Room created successfully.",
      data: data[0],
    });
  } catch (error) {
    console.error("Error creating room:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};
const editRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      room_title,
      room_desc,
      floor,
      department_id,
      type,
      status,
      user_id,
    } = req.body;

    try {
      const { data, error } = await supabase
        .from("room")
        .update({
          room_title,
          room_desc,
          floor,
          department_id,
          type,
          status,
        })
        .eq("id", id)
        .select();

      if (error) throw error;

      if (data.length === 0) {
        return res.status(404).json({
          title: "Not Found",
          message: "Room not found.",
          data: null,
        });
      }

      await supabase.from("activity_logs").insert({
        activity: `Edited room (${room_desc}) on floor ${floor} for department ${department_id}`,
        by: user_id ?? null,
      });

      return res.status(200).json({
        title: "Success",
        message: "Room updated successfully.",
        data: data[0],
      });
    } catch (error) {
      console.error("Error updating room:", error.message);

      return res.status(500).json({
        title: "Failed",
        message: "Something went wrong!",
        data: null,
      });
    }
  } catch (error) {
    console.error("Error editing room:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};
const deleteRoom = async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.body;

  try {
    const { data, error } = await supabase
      .from("room")
      .update({ status: "Inactive" })
      .eq("id", id)
      .select();

    if (error) throw error;

    await supabase.from("activity_logs").insert({
      activity: `Room ${id} set to Inactive. This room will be not usable anymore.`,
      by: user_id ?? null,
    });

    return res.status(200).json({
      title: "Success",
      message: "Room marked as inactive.",
      data: data[0],
    });
  } catch (error) {
    console.error("Error deleting room:", error.message);

    return res.status(500).json({
      title: "Failed",
      message: "Something went wrong!",
      data: null,
    });
  }
};
module.exports = {
  createRoom,
  editRoom,
  deleteRoom,
  getRooms,
};
