# Contributors

Thank you to everyone who has contributed to DelphiTools!

## How to Contribute

We welcome contributions! Here's how you can help:

### Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork** to your local machine:
   ```bash
   git clone https://github.com/yourusername/delphitools.git
   cd delphitools
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Run the development server**:
   ```bash
   npm run dev
   ```

### Making Changes

1. **Create a new branch** for your contribution:
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/your-bug-fix
   ```

2. **Make your changes** following the existing code style and patterns

3. **Test your changes**:
   - For new tools, add them to `components/tools/`
   - Update `components/tools/index.tsx` if needed
   - Test locally with `npm run dev`

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add your feature description"
   # or for fixes
   git commit -m "fix: describe the bug fix"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Opening a Pull Request

1. Go to your fork on GitHub
2. Click **"Compare & pull request"**
3. Write a clear title and description for your PR
4. Link to any related issues
5. Click **"Create pull request"**
