const PublicRoute = ({ children }: { children: React.ReactNode }) => {
  // Always show login page
  // The login page will handle empty API keys appropriately
  return children;
};

export default PublicRoute;