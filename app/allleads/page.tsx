"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Users, UserCheck, Database, CalendarDays, RefreshCw } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLanguage } from "@/app/hooks/useLanguage";

export default function AllLeadsPage() {
  const router = useRouter();
  const { t, language } = useLanguage();
  const tf = (key: string, values?: Record<string, string | number>) => {
    let text = String(t(key));
    if (!values) return text;
    Object.entries(values).forEach(([name, value]) => {
      text = text.replace(`{${name}}`, String(value));
    });
    return text;
  };
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<{ totalUsers: number; activeUsers: number; totalLeads: number; totalBookings: number } | null>(null);
  const [rows, setRows] = useState<Array<{ _id: string; username: string; email: string; verified: boolean; admin: boolean; createdAt: string; leadsCount: number; bookingsCount: number }>>([]);
  const [expanded, setExpanded] = useState<Record<string, 'leads' | 'bookings' | null>>({});
  const [leadsByUser, setLeadsByUser] = useState<Record<string, any[]>>({});
  const [bookingsByUser, setBookingsByUser] = useState<Record<string, any[]>>({});
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});

  // Chart data states
  const [leadsPieData, setLeadsPieData] = useState<any[]>([]);
  const [bookingsPieData, setBookingsPieData] = useState<any[]>([]);
  const [leadsLineData, setLeadsLineData] = useState<any[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [isSampleData, setIsSampleData] = useState(false);

  // Colors for charts
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FFC658', '#FF6B6B'];

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const user = auth.getCurrentUser();
    if (!user || user.admin !== true) {
      router.replace("/");
      return;
    }
    // load data
    void fetchData();
  }, [router]);

  const fetchData = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true); else setLoading(true);
      const authHeader = auth.getAuthHeader();
      const res = await fetch('/api/admin/all-leads', {
        headers: authHeader ? { Authorization: authHeader } : undefined,
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSummary(data.data.summary);
        setRows(data.data.users.map((u: any) => ({ ...u, createdAt: u.createdAt })));
        
        // Fetch real analytics data
        if (authHeader) {
          await fetchAnalyticsData(authHeader);
        }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAnalyticsData = async (authHeader: string) => {
    try {
      setAnalyticsLoading(true);
      const res = await fetch('/api/admin/leads-analytics', {
        headers: { Authorization: authHeader },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setLeadsPieData(data.data.leadsByUser);
        setBookingsPieData(data.data.bookingsByUser);
        setLeadsLineData(data.data.monthlyLeads);
        
        // Show note if sample data is being used
        if (data.note) {
          console.log('📊 Analytics Note:', data.note);
          setIsSampleData(true);
        } else {
          setIsSampleData(false);
        }
      } else {
        console.error('❌ Analytics API error:', data.message);
      }
    } catch (error) {
      console.error('❌ Error fetching analytics data:', error);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const prepareChartData = (users: any[]) => {
    // This function is no longer needed as we're fetching real data
    // But keeping it for backward compatibility
  };

  const generateMonthlyLeadsData = (users: any[]) => {
    // This function is no longer needed as we're fetching real data
    // But keeping it for backward compatibility
    return [];
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{`${label}`}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {`${entry.name}: ${entry.value}`}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const CustomPieTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.payload.name}</p>
          <p className="text-sm text-muted-foreground">{data.payload.email}</p>
          <p style={{ color: data.color }}>{tf('leadsCountLabel', { count: data.value })}</p>
        </div>
      );
    }
    return null;
  };

  const CustomBookingTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0];
      return (
        <div className="bg-background border rounded-lg p-3 shadow-lg">
          <p className="font-medium">{data.payload.name}</p>
          <p className="text-sm text-muted-foreground">{data.payload.email}</p>
          <p style={{ color: data.color }}>{tf('bookingsCountLabel', { count: data.value })}</p>
        </div>
      );
    }
    return null;
  };

  const toggleLeads = async (userId: string) => {
    const current = expanded[userId] === 'leads' ? null : 'leads';
    setExpanded({ ...expanded, [userId]: current });
    if (current === 'leads' && !leadsByUser[userId]) {
      setRowLoading({ ...rowLoading, [userId]: true });
      try {
        const res = await fetch(`/api/leads?userId=${userId}&limit=1000`);
        const data = await res.json();
        if (res.ok && data.success) {
          setLeadsByUser({ ...leadsByUser, [userId]: data.leads || [] });
        } else {
          setLeadsByUser({ ...leadsByUser, [userId]: [] });
        }
      } finally {
        setRowLoading({ ...rowLoading, [userId]: false });
      }
    }
  };

  const toggleBookings = async (userId: string) => {
    const current = expanded[userId] === 'bookings' ? null : 'bookings';
    setExpanded({ ...expanded, [userId]: current });
    if (current === 'bookings' && !bookingsByUser[userId]) {
      setRowLoading({ ...rowLoading, [userId]: true });
      try {
        const res = await fetch(`/api/bookings?userId=${userId}&limit=1000`);
        const data = await res.json();
        if (res.ok && data.success) {
          const list = data.data?.bookings || data.bookings || [];
          setBookingsByUser({ ...bookingsByUser, [userId]: list });
        } else {
          setBookingsByUser({ ...bookingsByUser, [userId]: [] });
        }
      } finally {
        setRowLoading({ ...rowLoading, [userId]: false });
      }
    }
  };

  const getStatusBadgeClasses = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'active':
        return 'bg-blue-600/20 text-blue-300 border-blue-700/40';
      case 'emailed':
        return 'bg-amber-600/20 text-amber-300 border-amber-700/40';
      case 'replied':
        return 'bg-green-600/20 text-green-300 border-green-700/40';
      case 'booked':
        return 'bg-violet-600/20 text-violet-300 border-violet-700/40';
      case 'closed won':
        return 'bg-emerald-600/20 text-emerald-300 border-emerald-700/40';
      case 'closed lost':
        return 'bg-red-600/20 text-red-300 border-red-700/40';
      case 'not interested':
        return 'bg-gray-600/20 text-gray-300 border-gray-700/40';
      default:
        return 'bg-gray-600/20 text-gray-300 border-gray-700/40';
    }
  };

  const getTranslatedStatus = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'active':
        return String(t('active'));
      case 'emailed':
        return String(t('emailed'));
      case 'replied':
        return String(t('replied'));
      case 'booked':
        return String(t('booked'));
      case 'closed won':
        return String(t('closedWon'));
      case 'closed lost':
        return String(t('closedLost'));
      case 'not interested':
        return String(t('notInterested'));
      default:
        return status;
    }
  };

  return (
    <div className="animate-in">
      <SectionHeader 
        title={String(t('allLeads'))}
        description={String(t('adminOnlyOverview'))}
        action={
          <Button variant="outline" size="sm" onClick={() => fetchData(true)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            {String(t('refresh'))}
          </Button>
        }
      />

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-6">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('totalUsersAdmin'))}</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('activeUsersAdmin'))}</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{summary?.activeUsers ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('totalLeads'))}</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalLeads ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('totalBookingsAdmin'))}</CardTitle>
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalBookings ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="mt-6">
        <div className="mb-4 p-3 bg-blue-600/10 border border-blue-600/20 rounded-lg">
          <p className="text-sm text-blue-300">
            📊 <strong>{String(t('realtimeAnalyticsTitle'))}:</strong> {String(t('realtimeAnalyticsDescription'))}
            {isSampleData && (
              <span className="ml-2 text-amber-300">
                ⚠️ <strong>{String(t('noteLabel'))}:</strong> {String(t('sampleDataNote'))}
              </span>
            )}
          </p>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-card md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('leadsDistribution'))}</CardTitle>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchAnalyticsData(auth.getAuthHeader() || '')}
                disabled={analyticsLoading}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`h-3 w-3 ${analyticsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('loadingLeadsDistribution'))}</p>
                </div>
              </div>
            ) : leadsPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={leadsPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    fill="#8884D8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {leadsPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomPieTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('noLeadsDataAvailable'))}</p>
                  <p className="text-xs text-muted-foreground mt-1">{String(t('dataFetchedFromDatabase'))}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card md:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('totalLeadsCollection'))}</CardTitle>
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchAnalyticsData(auth.getAuthHeader() || '')}
                disabled={analyticsLoading}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`h-3 w-3 ${analyticsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('loadingLeadsCollection'))}</p>
                </div>
              </div>
            ) : leadsLineData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={leadsLineData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9CA3AF" />
                    <YAxis stroke="#9CA3AF" />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="leads" 
                      stroke="#8884D8" 
                      strokeWidth={3}
                      activeDot={{ r: 8, fill: "#8884D8" }}
                      dot={{ fill: "#8884D8", strokeWidth: 2, r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="mt-3 text-xs text-muted-foreground text-center">
                  {tf('actualLeadCreationDatesForYear', { year: new Date().getFullYear() })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <Database className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('noLeadsCollectionDataAvailable'))}</p>
                  <p className="text-xs text-muted-foreground mt-1">{String(t('dataFetchedFromDatabase'))}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">{String(t('bookingsDistribution'))}</CardTitle>
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => fetchAnalyticsData(auth.getAuthHeader() || '')}
                disabled={analyticsLoading}
                className="h-6 w-6 p-0"
              >
                <RefreshCw className={`h-3 w-3 ${analyticsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('loadingBookingsDistribution'))}</p>
                </div>
              </div>
            ) : bookingsPieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={bookingsPieData}
                    cx="50%"
                    cy="50%"
                    outerRadius={120}
                    fill="#8884D8"
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {bookingsPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomBookingTooltip />} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                <div className="text-center">
                  <CalendarDays className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">{String(t('noBookingsDataAvailable'))}</p>
                  <p className="text-xs text-muted-foreground mt-1">{String(t('dataFetchedFromDatabase'))}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      </div>

      {/* Users as full-width stacked cards */}
      <div className="space-y-4 mt-6">
        {loading ? (
          <Card className="bg-card"><CardContent className="p-6 text-sm text-muted-foreground">{String(t('loading'))}</CardContent></Card>
        ) : rows.length === 0 ? (
          <Card className="bg-card"><CardContent className="p-6 text-sm text-muted-foreground">{String(t('noUsersFound'))}</CardContent></Card>
        ) : (
          rows.map((u) => {
            const isLoading = rowLoading[u._id];
            const expandMode = expanded[u._id];
            const leads = leadsByUser[u._id] || [];
            const bookings = bookingsByUser[u._id] || [];
            return (
              <Card key={u._id} className="bg-card">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">{u.username} <span className="ml-2 text-sm text-foreground/85 break-all">{u.email}</span></CardTitle>
                      <div className="mt-1">
                        {u.admin ? (
                          <span className="text-xs px-2 py-1 rounded border bg-purple-600/20 text-purple-300 border-purple-700/40">{String(t('adminLabel'))}</span>
                        ) : (
                          <span className="text-xs px-2 py-1 rounded border bg-gray-600/20 text-gray-300 border-gray-700/40">{String(t('userLabel'))}</span>
                        )}
                        {u.verified ? (
                          <span className="text-xs ml-2 px-2 py-1 rounded border bg-green-600/20 text-green-300 border-green-700/40">{String(t('activeUserLabel'))}</span>
                        ) : (
                          <span className="text-xs ml-2 px-2 py-1 rounded border bg-red-600/20 text-red-300 border-red-700/40">{String(t('inactiveUserLabel'))}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs text-foreground/70">{tf('joinedOn', { date: new Date(u.createdAt).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US') })}</div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-sm">{String(t('leadsLabel'))}: <strong>{u.leadsCount}</strong></span>
                    <span className="text-sm">{String(t('bookingsLabel'))}: <strong>{u.bookingsCount}</strong></span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={expandMode === 'leads' ? 'default' : 'outline'} onClick={() => toggleLeads(u._id)} disabled={isLoading}>
                      {tf('viewLeadsCount', { count: u.leadsCount })}
                    </Button>
                    <Button size="sm" variant={expandMode === 'bookings' ? 'default' : 'outline'} onClick={() => toggleBookings(u._id)} disabled={isLoading}>
                      {tf('viewBookingsCount', { count: u.bookingsCount })}
                    </Button>
                  </div>

                  {/* Expanded details */}
                  {expandMode && (
                    <div className="mt-4">
                      {isLoading ? (
                        <div className="text-sm text-muted-foreground">{String(t('loading'))}</div>
                      ) : expandMode === 'leads' ? (
                        <div className="space-y-3">
                          {leads.length === 0 ? (
                            <div className="text-sm text-muted-foreground">{String(t('noLeadsFoundForUser'))}</div>
                          ) : (
                            leads.map((lead: any) => (
                              <div key={lead._id || lead.id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">{lead.name || lead.fullName} — <span className="text-muted-foreground">{lead.company}</span></div>
                                  <div className={`text-xs px-2 py-0.5 rounded border ${getStatusBadgeClasses(lead.status)}`}>{getTranslatedStatus(lead.status)}</div>
                                </div>
                                <div className="text-xs text-foreground/80 mt-1">{lead.email}</div>
                                <div className="text-xs text-foreground/70 mt-1">{tf('sourceLabel', { source: lead.source || String(t('manualSource')) })}</div>
                                <div className="text-xs text-foreground/70 mt-1">{tf('createdLabel', { date: new Date(lead.createdAt || lead.created_at).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US') })}</div>
                              </div>
                            ))
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {bookings.length === 0 ? (
                            <div className="text-sm text-muted-foreground">{String(t('noBookingsFoundForUser'))}</div>
                          ) : (
                            bookings.map((b: any) => (
                              <div key={b._id} className="p-3 border rounded-lg">
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">{b.companyName} — <span className="text-muted-foreground">{b.clientName}</span></div>
                                  <div className={`text-xs px-2 py-0.5 rounded border ${getStatusBadgeClasses(b.status)}`}>{getTranslatedStatus(b.status)}</div>
                                </div>
                                <div className="text-xs text-foreground/80 mt-1">{b.companyEmail}</div>
                                <div className="text-xs text-foreground/70 mt-1">{tf('dateTimeLabel', { date: new Date(b.preferredDate).toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-US'), time: b.preferredTime })}</div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
