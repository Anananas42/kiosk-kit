import { Admin, CustomRoutes, Resource } from "react-admin";
import { Route } from "react-router";
import { authProvider } from "./authProvider.js";
import { dataProvider } from "./dataProvider.js";

function Dashboard() {
  return (
    <div style={{ padding: "1rem" }}>
      <h1>Admin Dashboard</h1>
      <p>Welcome to the KioskKit admin panel.</p>
    </div>
  );
}

export function App() {
  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      dashboard={Dashboard}
    >
      <CustomRoutes>
        <Route path="/" element={<Dashboard />} />
      </CustomRoutes>
    </Admin>
  );
}
