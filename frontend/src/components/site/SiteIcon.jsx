import React from 'react';
import {
  Award, Banknote, BarChart3, BookOpen, Briefcase, Building2, CalendarDays, ClipboardList, Clock, Crown, Download, Eye, FileSpreadsheet,
  GraduationCap, HeartHandshake, Home, CreditCard, Languages, Layers, LayoutDashboard, Megaphone, MessageCircle, MessageSquare, Network, Phone,
  Presentation, School, ShieldCheck, Unplug, UserCheck, UserPlus, Users, Wallet, Sparkles,
} from 'lucide-react';

const MAP = {
  Award, Banknote, BarChart3, BookOpen, Briefcase, Building2, CalendarDays, ClipboardList, Clock, Crown, Download, Eye, FileSpreadsheet,
  GraduationCap, HeartHandshake, Home, CreditCard, Languages, Layers, LayoutDashboard, Megaphone, MessageCircle, MessageSquare, Network, Phone,
  Presentation, School, ShieldCheck, Unplug, UserCheck, UserPlus, Users, Wallet, Sparkles,
};

// Draws a lucide icon by name, so the content file can stay plain data.
export default function SiteIcon({ name, className = 'h-5 w-5', ...rest }) {
  const C = MAP[name] || Sparkles;
  return <C className={className} aria-hidden="true" {...rest} />;
}
