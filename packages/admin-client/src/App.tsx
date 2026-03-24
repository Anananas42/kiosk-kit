import { Admin, Resource } from "react-admin";
import { authProvider } from "./authProvider.js";
import { dataProvider } from "./dataProvider.js";
import { Dashboard } from "./Dashboard.js";
import { DeviceList, DeviceCreate, DeviceEdit } from "./resources/devices.js";
import { UserList, UserShow } from "./resources/users.js";

export function App() {
  return (
    <Admin
      authProvider={authProvider}
      dataProvider={dataProvider}
      dashboard={Dashboard}
    >
      <Resource
        name="devices"
        list={DeviceList}
        create={DeviceCreate}
        edit={DeviceEdit}
      />
      <Resource
        name="users"
        list={UserList}
        show={UserShow}
        recordRepresentation="name"
      />
    </Admin>
  );
}
