const supabase = require('../../supabase');

const getRooms = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('room')
      .select(`
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
      `)
      .neq('status', 'Inactive');

    if (error) throw error;

    const dayMap = {
      M: 'Monday',
      T: 'Tuesday',
      W: 'Wednesday',
      Th: 'Thursday',
      F: 'Friday',
      S: 'Saturday',
      Su: 'Sunday'
    };
  
    const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const getDayOfWeek = (abbrev) => {
      if (!abbrev) return '';

      const dayCodes = ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'];
      const dayMap = {
        Su: 'Sunday',
        M: 'Monday',
        T: 'Tuesday',
        W: 'Wednesday',
        Th: 'Thursday',
        F: 'Friday',
        S: 'Saturday'
      };
    
      const today = new Date().toLocaleDateString('en-US', { weekday: 'long' });
      const todayCode = Object.entries(dayMap).find(([code, name]) => name === today)?.[0];
    
      const detectedCodes = [];
      for (let i = 0; i < abbrev.length; i++) {
        const ch = abbrev[i];
        if (ch === 'T' && abbrev[i + 1] === 'h') {
          detectedCodes.push('Th');
          i++;
        } else if (ch === 'S' && abbrev[i + 1] === 'u') {
          detectedCodes.push('Su');
          i++;
        } else {
          detectedCodes.push(ch);
        }
      }
    
      if (detectedCodes.includes(todayCode)) {
        return dayMap[todayCode];
      }
    
      return dayMap[detectedCodes[0]] || '';
    };


    const formatTime = (time) => time?.slice(0, 5); // "13:00:00" → "13:00"

    const calculateHours = (start, end) => {
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      return Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 10) / 10;
    };

    const formattedRooms = data.map((room) => {
      const todaySchedules = room.teacher_schedules.filter((sched) => {
        // Check if today's day is included in the 'days' string (e.g., "MWF")
        if (!sched.days) return false;
        const dayMatch = todayName === 'Thursday'
          ? sched.days.includes('Th')
          : sched.days.includes(todayName[0]);
        return dayMatch;
      });

      const formattedSchedules = room.teacher_schedules.map((sched) => {
        const professorName = sched.teachers_profile?.user_profile?.name || 'N/A';
        const subjectName = sched.subjects?.subject || 'N/A';

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

      const currentSchedule = todaySchedules.length > 0
        ? {
          id: todaySchedules[0].id,
          subjectName: todaySchedules[0].subjects?.subject || 'N/A',
          professor: todaySchedules[0].teachers_profile?.user_profile?.name || 'N/A',
          startTime: formatTime(todaySchedules[0].start_time),
          endTime: formatTime(todaySchedules[0].end_time),
          hour: calculateHours(todaySchedules[0].start_time, todaySchedules[0].end_time),
          dayOfWeek: getDayOfWeek(todaySchedules[0].days),
          roomId: room.room_id,
        }
        : null;

      return {
        id: room.id,
        roomId: room.room_id,
        roomTitle: room.room_title,
        roomDescription: room.room_desc,
        department: room.departments?.name || 'N/A',
        floor: room.floor,
        roomStatus: room.status,
        currentSchedule,
        schedules: formattedSchedules,
      };
    });

    return res.status(200).json({
      title: 'Success',
      message: 'Rooms fetched successfully.',
      data: formattedRooms
    });
  } catch (error) {
    console.error('Error fetching rooms:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};


const createRoom = async (req, res) => {
  try {
    const { room_desc, floor, department_id } = req.body;

    const { data: latestRoom, error: fetchError } = await supabase
      .from('room')
      .select('id')
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) throw fetchError;


    let nextIdNumber = 1;
    if (latestRoom.length > 0) {
      const latestId = latestRoom[0].id.replace('RM', '');
      nextIdNumber = parseInt(latestId) + 1;
    }

    const roomID = `RM${nextIdNumber.toString().padStart(4, '0')}`


    const { data, error } = await supabase
      .from('room')
      .insert({
        id: roomID,
        room_desc,
        floor,
        department_id,
        status: 'Active'
      })
      .select();

    if (error) throw error;


    return res.status(201).json({
      title: 'Success',
      message: 'Room created successfully.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error creating room:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
};


const editRoom = async (req, res) => {
  try {
    const { id } = req.params;
    const { room_title, room_desc, floor, department_id, status } = req.body;

    try {
      const { data, error } = await supabase
        .from('room')
        .update({
          room_title,
          room_desc,
          floor,
          department_id,
          status
        })
        .eq('id', id)
        .select();

      if (error) throw error;

      if (data.length === 0) {
        return res.status(404).json({
          title: 'Not Found',
          message: 'Room not found.',
          data: null
        });
      }

      return res.status(200).json({
        title: 'Success',
        message: 'Room updated successfully.',
        data: data[0]
      });
    } catch (error) {
      console.error('Error updating room:', error.message);

      return res.status(500).json({
        title: 'Failed',
        message: 'Something went wrong!',
        data: null
      });
    }

  } catch (error) {
    console.error('Error editing room:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}

const deleteRoom = async (req, res) => {
  const { id } = req.params;
  try {
    const { data, error } = await supabase
      .from('room')
      .update({ status: 'Inactive' })
      .eq('id', id)
      .select();

    if (error) throw error;

    return res.status(200).json({
      title: 'Success',
      message: 'Room marked as inactive.',
      data: data[0]
    });
  } catch (error) {
    console.error('Error deleting room:', error.message);

    return res.status(500).json({
      title: 'Failed',
      message: 'Something went wrong!',
      data: null
    });
  }
}
module.exports = {
  createRoom,
  editRoom,
  deleteRoom,
  getRooms
};
