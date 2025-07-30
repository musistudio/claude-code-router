const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  // For this application, we allow access without an API key
  // The App component will handle loading and error states
  return children;
};

export default ProtectedRoute;