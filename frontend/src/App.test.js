import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the VerifyVote login screen', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /verifyvote/i })).toBeInTheDocument();
});
