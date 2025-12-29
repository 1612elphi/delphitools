import Link from "next/link";
import { Home, Frown } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-muted mb-6">
        <Frown className="size-10 text-muted-foreground" />
      </div>
      <h1 className="text-3xl font-bold mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you&apos;re looking for doesn&apos;t exist or has been moved.
      </p>
      <Button asChild>
        <Link href="/">
          <Home className="size-4 mr-2" />
          Back to Home
        </Link>
      </Button>
    </div>
  );
}
