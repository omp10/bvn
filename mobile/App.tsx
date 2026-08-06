import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/auth";
import Navigation from "./src/navigation";

// Registers the background location task at module load, before anything
// renders. The OS can launch this app straight into that task with no UI.
import "./src/tracker";

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Navigation />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
