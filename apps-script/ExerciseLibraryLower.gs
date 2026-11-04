/**
 * ExerciseLibraryLower.gs — data only: the lower-body, abs and spine half of the exercise library (see ExerciseLibrary.gs).
 * Rows are [Exercise, Primary, Secondary, Tertiary]. The four Spinal groups come last on purpose: they are lower-back work,
 * not hypertrophy volume, so they sit at the bottom of the Muscle Summary.
 * Hinges (RDL, deadlift, good morning) credit Spinal Extension as a secondary; the pad-high GHD / 45-degree hyperextension
 * is Spinal Extension primary, and the pad-low "(Glute Focus)" version is Glutes primary.
 * The GHD / hyperextension / side-bend family is bodyweight-or-plate by nature and is in on purpose.
 */
var EXERCISE_LIBRARY_LOWER = [
  // Quads
  ['Back Squat', 'Quads', 'Glutes', 'Adductors, Spinal Extension'],
  ['Front Squat', 'Quads', 'Glutes', 'Spinal Extension'],
  ['Smith Machine Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Hack Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Pendulum Squat', 'Quads', 'Glutes', ''],
  ['Belt Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Dumbbell Goblet Squat', 'Quads', 'Glutes', ''],
  ['Leg Press', 'Quads', 'Glutes', 'Adductors'],
  ['Narrow-Stance Leg Press', 'Quads', 'Glutes', ''],
  ['Wide-Stance Leg Press', 'Quads', 'Glutes', 'Adductors'],
  ['Single-Leg Leg Press', 'Quads', 'Glutes', 'Adductors'],
  ['Leg Extension', 'Quads', '', ''],
  ['Single-Leg Leg Extension', 'Quads', '', ''],
  ['Sissy Squat Machine', 'Quads', '', ''],
  ['Barbell Bulgarian Split Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Dumbbell Bulgarian Split Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Smith Machine Bulgarian Split Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Smith Machine Split Squat', 'Quads', 'Glutes', 'Adductors'],
  ['Barbell Walking Lunge', 'Quads', 'Glutes', 'Adductors, Hamstrings'],
  ['Dumbbell Walking Lunge', 'Quads', 'Glutes', 'Adductors, Hamstrings'],
  ['Barbell Reverse Lunge', 'Quads', 'Glutes', 'Adductors'],
  ['Dumbbell Reverse Lunge', 'Quads', 'Glutes', 'Adductors'],
  ['Smith Machine Reverse Lunge', 'Quads', 'Glutes', 'Adductors'],
  ['Dumbbell Step-Up', 'Quads', 'Glutes', ''],
  ['Barbell Step-Up', 'Quads', 'Glutes', ''],

  // Hamstrings
  ['Romanian Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Forearms'],
  ['Dumbbell Romanian Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Forearms'],
  ['Smith Machine Romanian Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes'],
  ['Trap-Bar Romanian Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Forearms'],
  ['Single-Leg Dumbbell Romanian Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Adductors'],
  ['Stiff-Leg Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Forearms'],
  ['Conventional Deadlift', 'Hamstrings', 'Spinal Extension', 'Glutes, Quads, Traps'],
  ['Barbell Good Morning', 'Hamstrings', 'Spinal Extension', 'Glutes'],
  ['Seated Leg Curl', 'Hamstrings', '', 'Calves'],
  ['Lying Leg Curl', 'Hamstrings', '', 'Calves'],
  ['Single-Leg Seated Leg Curl', 'Hamstrings', '', 'Calves'],
  ['Standing Single-Leg Curl', 'Hamstrings', '', 'Calves'],
  ['Cable Standing Leg Curl', 'Hamstrings', '', 'Calves'],
  ['Cable Pull-Through', 'Hamstrings', 'Glutes', 'Spinal Extension'],
  ['Weighted Glute-Ham Raise', 'Hamstrings', 'Glutes', 'Calves, Spinal Extension'],

  // Glutes (hip abduction counts here: glute medius)
  ['Barbell Hip Thrust', 'Glutes', 'Hamstrings', 'Adductors'],
  ['Smith Machine Hip Thrust', 'Glutes', 'Hamstrings', 'Adductors'],
  ['Machine Hip Thrust', 'Glutes', 'Hamstrings', 'Adductors'],
  ['Dumbbell Hip Thrust', 'Glutes', 'Hamstrings', 'Adductors'],
  ['Single-Leg Dumbbell Hip Thrust', 'Glutes', 'Hamstrings', 'Adductors'],
  ['Barbell Glute Bridge', 'Glutes', 'Hamstrings', ''],
  ['Smith Machine Glute Bridge', 'Glutes', 'Hamstrings', ''],
  ['Dumbbell Frog Pump', 'Glutes', 'Hamstrings', ''],
  ['Cable Glute Kickback', 'Glutes', 'Hamstrings', ''],
  ['Machine Glute Kickback', 'Glutes', 'Hamstrings', ''],
  ['45-Degree Hyperextension (Glute Focus)', 'Glutes', 'Hamstrings', 'Spinal Extension'],
  ['Reverse Hyperextension', 'Glutes', 'Hamstrings', 'Spinal Extension'],
  ['Hip Abduction Machine', 'Glutes', '', ''],
  ['Cable Hip Abduction', 'Glutes', '', ''],
  ['Sumo Deadlift', 'Glutes', 'Spinal Extension', 'Adductors, Quads, Hamstrings'],
  ['Dumbbell Curtsy Lunge', 'Glutes', 'Quads', 'Adductors'],
  ['High-Box Dumbbell Step-Up', 'Glutes', 'Quads', ''],

  // Adductors
  ['Hip Adduction Machine', 'Adductors', '', ''],
  ['Single-Leg Hip Adduction Machine', 'Adductors', '', ''],
  ['Cable Hip Adduction', 'Adductors', '', ''],

  // Calves (gastrocnemius and soleus)
  ['Standing Calf Raise', 'Calves', '', ''],
  ['Barbell Standing Calf Raise', 'Calves', '', ''],
  ['Smith Machine Calf Raise', 'Calves', '', ''],
  ['Seated Calf Raise', 'Calves', '', ''],
  ['Leg Press Calf Raise', 'Calves', '', ''],
  ['Hack Squat Calf Raise', 'Calves', '', ''],
  ['Donkey Calf Raise', 'Calves', '', ''],
  ['Single-Leg Dumbbell Calf Raise', 'Calves', '', ''],
  ['Eccentric-Accentuated Standing Calf Raise', 'Calves', '', ''],

  // Abs (hypertrophy work; the crunch family also credits Spinal Flexion)
  ['Cable Crunch', 'Abs', 'Spinal Flexion', ''],
  ['Standing Cable Crunch', 'Abs', 'Spinal Flexion', ''],
  ['Single-Arm Cable Crunch', 'Abs', 'Spinal Flexion', 'Spinal Rotation'],
  ['Decline Cable Crunch', 'Abs', 'Spinal Flexion', ''],
  ['Machine Crunch', 'Abs', 'Spinal Flexion', ''],
  ['Weighted Decline Crunch', 'Abs', 'Spinal Flexion', ''],

  // Spinal Extension
  ['GHD Back Extension (Pad High)', 'Spinal Extension', 'Glutes', 'Hamstrings'],
  ['Weighted GHD Back Extension (Pad High)', 'Spinal Extension', 'Glutes', 'Hamstrings'],
  ['45-Degree Hyperextension (Spine Focus)', 'Spinal Extension', 'Glutes', 'Hamstrings'],
  ['Weighted 45-Degree Hyperextension (Spine Focus)', 'Spinal Extension', 'Glutes', 'Hamstrings'],
  ['Machine Back Extension', 'Spinal Extension', 'Glutes', 'Hamstrings'],
  ['Seated Barbell Good Morning', 'Spinal Extension', 'Glutes', 'Hamstrings'],

  // Spinal Flexion (flexion-specific drills)
  ['Weighted GHD Sit-Up', 'Spinal Flexion', 'Abs', ''],
  ['Weighted Decline Sit-Up', 'Spinal Flexion', 'Abs', ''],
  ['Weighted Reverse Crunch', 'Spinal Flexion', 'Abs', ''],
  ['Seated Cable Spinal Flexion', 'Spinal Flexion', 'Abs', ''],

  // Spinal Side Bend
  ['GHD Side Bend', 'Spinal Side Bend', 'Abs', 'Glutes'],
  ['Weighted GHD Side Bend', 'Spinal Side Bend', 'Abs', 'Glutes'],
  ['45-Degree Hyperextension Side Bend', 'Spinal Side Bend', 'Abs', 'Glutes'],
  ['Weighted 45-Degree Hyperextension Side Bend', 'Spinal Side Bend', 'Abs', 'Glutes'],
  ['Dumbbell Side Bend', 'Spinal Side Bend', 'Abs', 'Forearms'],
  ['Cable Side Bend', 'Spinal Side Bend', 'Abs', ''],
  ['Farmer\'s Carry', 'Spinal Side Bend', 'Forearms', 'Traps, Abs, Glutes'],
  ['Suitcase Carry', 'Spinal Side Bend', 'Forearms', 'Abs, Traps, Glutes'],

  // Spinal Rotation (Pallof presses resist rotation)
  ['Cable Trunk Rotation', 'Spinal Rotation', 'Abs', ''],
  ['High-to-Low Cable Woodchop', 'Spinal Rotation', 'Abs', 'Front Delts'],
  ['Low-to-High Cable Woodchop', 'Spinal Rotation', 'Abs', 'Front Delts'],
  ['Landmine Rotation', 'Spinal Rotation', 'Abs', 'Front Delts'],
  ['Pallof Press', 'Spinal Rotation', 'Abs', ''],
  ['Half-Kneeling Pallof Press', 'Spinal Rotation', 'Abs', ''],
  ['Rotary Torso Machine', 'Spinal Rotation', 'Abs', ''],
  ['Weighted Russian Twist', 'Spinal Rotation', 'Abs', '']
];
