import { useState } from 'react';
import { Plus, Pencil, Trash2, GripVertical, X, Check } from 'lucide-react';
import { Button, Input } from '../ui';
import { useMenuManagementStore } from '../../store/menu-management-store';
import { t } from '../../i18n';

const CourseManager = () => {
  const { courses, coursesLoading, addCourse, updateCourseItem, deleteCourse } =
    useMenuManagementStore();

  const [newCourseName, setNewCourseName] = useState('');
  const [newPriority, setNewPriority] = useState(0);
  const [editingCourse, setEditingCourse] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPriority, setEditPriority] = useState(0);

  const handleAddCourse = async () => {
    if (!newCourseName.trim()) return;
    await addCourse(newCourseName.trim(), newPriority);
    setNewCourseName('');
    setNewPriority(0);
  };

  const handleStartEdit = (course: any) => {
    setEditingCourse(course.name);
    setEditName(course.course);
    setEditPriority(course.custom_serving_priority || 0);
  };

  const handleSaveEdit = async (courseName: string) => {
    await updateCourseItem(courseName, {
      course: editName,
      serving_priority: editPriority,
    });
    setEditingCourse(null);
  };

  const handleDelete = async (courseName: string) => {
    if (
      confirm(
        t('menu_management.confirm_delete_course') || 'Delete this course? Items using it will become uncategorized.'
      )
    ) {
      await deleteCourse(courseName);
    }
  };

  if (coursesLoading) {
    return (
      <div className="flex justify-center py-8">
        <p className="text-gray-500">Loading courses...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add new course */}
      <div className="flex items-end gap-3 p-4 bg-gray-50 rounded-lg">
        <div className="flex-1">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('menu_management.course_name') || 'Course Name'}
          </label>
          <Input
            placeholder="e.g., Starters, Main Course, Desserts"
            value={newCourseName}
            onChange={(e) => setNewCourseName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCourse()}
          />
        </div>
        <div className="w-24">
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('menu_management.priority') || 'Priority'}
          </label>
          <Input
            type="number"
            value={newPriority}
            onChange={(e) => setNewPriority(parseInt(e.target.value) || 0)}
          />
        </div>
        <Button onClick={handleAddCourse} disabled={!newCourseName.trim()}>
          <Plus className="w-4 h-4 me-1" />
          {t('common.save') || 'Add'}
        </Button>
      </div>

      {/* Courses list */}
      {courses.length === 0 ? (
        <p className="text-center text-gray-400 py-6">
          {t('menu_management.no_courses') || 'No courses defined yet'}
        </p>
      ) : (
        <div className="space-y-2">
          {courses.map((course) => (
            <div
              key={course.name}
              className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg"
            >
              <GripVertical className="w-4 h-4 text-gray-300" />

              {editingCourse === course.name ? (
                <>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1"
                  />
                  <Input
                    type="number"
                    value={editPriority}
                    onChange={(e) => setEditPriority(parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <Button size="sm" onClick={() => handleSaveEdit(course.name)}>
                    <Check className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditingCourse(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">
                      {course.course}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    Priority: {course.custom_serving_priority}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleStartEdit(course)}
                  >
                    <Pencil className="w-4 h-4 text-gray-400" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(course.name)}
                  >
                    <Trash2 className="w-4 h-4 text-red-400" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CourseManager;
