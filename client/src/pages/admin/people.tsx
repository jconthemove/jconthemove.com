import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import AdminUsersPage from "@/pages/admin-users";
import AdminTestimonialsPage from "@/pages/admin-testimonials";
import EmployeesPage from "@/pages/employees";

export default function AdminPeoplePage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-6xl mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-white">People</h1>
          <p className="text-slate-400 text-sm">Users, employees, and customer reviews</p>
        </div>
        <Tabs defaultValue="users">
          <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6">
            <TabsTrigger value="users" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Users & Roles</TabsTrigger>
            <TabsTrigger value="employees" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Employees</TabsTrigger>
            <TabsTrigger value="reviews" className="data-[state=active]:bg-blue-600/20 data-[state=active]:text-blue-300">Reviews</TabsTrigger>
          </TabsList>
          <TabsContent value="users">
            <AdminUsersPage />
          </TabsContent>
          <TabsContent value="employees">
            <EmployeesPage />
          </TabsContent>
          <TabsContent value="reviews">
            <AdminTestimonialsPage />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
