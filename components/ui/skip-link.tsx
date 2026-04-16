const SkipLink = () => {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-[1000] focus:px-4 focus:py-2 focus:rounded-[var(--radius)]focus:bg-background focus:text-foreground focus:border focus:border-border focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background focus:font-medium"
    >
      Skip to main content
    </a>
  );
};

export default SkipLink;
