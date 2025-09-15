import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { Activity, AlertTriangle, Users, TrendingDown, ChevronDown, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Panchayath {
  id: string;
  name: string;
}

interface AgentPerformance {
  agent_id: string;
  agent_name: string;
  agent_type: string;
  mobile_number: string;
  consecutive_leave_days: number;
  is_inactive: boolean;
  last_activity_date: string | null;
  total_notes: number;
}

interface PerformanceStats {
  total_agents: number;
  inactive_agents: number;
  inactive_percentage: number;
}

export const PerformanceReport = () => {
  const [panchayaths, setPanchayaths] = useState<Panchayath[]>([]);
  const [selectedPanchayath, setSelectedPanchayath] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7)); // Current month YYYY-MM
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [performanceStats, setPerformanceStats] = useState<PerformanceStats>({
    total_agents: 0,
    inactive_agents: 0,
    inactive_percentage: 0
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch panchayaths on component mount
  useEffect(() => {
    fetchPanchayaths();
  }, []);

  // Fetch performance data when panchayath or month is selected
  useEffect(() => {
    if (selectedPanchayath && selectedMonth) {
      fetchPerformanceData();
    }
  }, [selectedPanchayath, selectedMonth]);

  const fetchPanchayaths = async () => {
    try {
      const { data, error } = await supabase
        .from('panchayaths')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setPanchayaths(data || []);
    } catch (error) {
      console.error('Error fetching panchayaths:', error);
      toast({
        title: "Error",
        description: "Failed to fetch panchayaths",
        variant: "destructive"
      });
    }
  };

  const fetchPerformanceData = async () => {
    if (!selectedPanchayath || !selectedMonth) return;
    
    setLoading(true);
    try {
      const allAgents: AgentPerformance[] = [];

      // Get coordinators
      const { data: coordinators, error: coordError } = await supabase
        .from('coordinators')
        .select('id, name, mobile_number, panchayath_id')
        .eq('panchayath_id', selectedPanchayath);

      if (coordError) throw coordError;

      if (coordinators) {
        for (const agent of coordinators) {
          const performance = await analyzeAgentPerformance(agent.mobile_number, agent.name, 'coordinator');
          allAgents.push({
            agent_id: agent.id,
            agent_name: agent.name,
            agent_type: 'coordinator',
            mobile_number: agent.mobile_number,
            ...performance
          });
        }
      }

      // Get supervisors
      const { data: supervisors, error: supError } = await supabase
        .from('supervisors')
        .select('id, name, mobile_number, panchayath_id')
        .eq('panchayath_id', selectedPanchayath);

      if (supError) throw supError;

      if (supervisors) {
        for (const agent of supervisors) {
          const performance = await analyzeAgentPerformance(agent.mobile_number, agent.name, 'supervisor');
          allAgents.push({
            agent_id: agent.id,
            agent_name: agent.name,
            agent_type: 'supervisor',
            mobile_number: agent.mobile_number,
            ...performance
          });
        }
      }

      // Get group leaders
      const { data: groupLeaders, error: glError } = await supabase
        .from('group_leaders')
        .select('id, name, mobile_number, panchayath_id')
        .eq('panchayath_id', selectedPanchayath);

      if (glError) throw glError;

      if (groupLeaders) {
        for (const agent of groupLeaders) {
          const performance = await analyzeAgentPerformance(agent.mobile_number, agent.name, 'group_leader');
          allAgents.push({
            agent_id: agent.id,
            agent_name: agent.name,
            agent_type: 'group_leader',
            mobile_number: agent.mobile_number,
            ...performance
          });
        }
      }

      // Get pros
      const { data: pros, error: prosError } = await supabase
        .from('pros')
        .select('id, name, mobile_number, panchayath_id')
        .eq('panchayath_id', selectedPanchayath);

      if (prosError) throw prosError;

      if (pros) {
        for (const agent of pros) {
          const performance = await analyzeAgentPerformance(agent.mobile_number, agent.name, 'pro');
          allAgents.push({
            agent_id: agent.id,
            agent_name: agent.name,
            agent_type: 'pro',
            mobile_number: agent.mobile_number,
            ...performance
          });
        }
      }

      setAgentPerformance(allAgents);
      
      // Calculate performance statistics
      const totalAgents = allAgents.length;
      const inactiveAgents = allAgents.filter(agent => agent.is_inactive).length;
      const inactivePercentage = totalAgents > 0 ? (inactiveAgents / totalAgents) * 100 : 0;

      setPerformanceStats({
        total_agents: totalAgents,
        inactive_agents: inactiveAgents,
        inactive_percentage: Math.round(inactivePercentage * 100) / 100
      });

    } catch (error) {
      console.error('Error fetching performance data:', error);
      toast({
        title: "Error",
        description: "Failed to fetch performance data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const analyzeAgentPerformance = async (mobileNumber: string, agentName: string, agentType: string) => {
    try {
      // Get daily notes for the selected month
      const startOfMonth = new Date(selectedMonth + '-01');
      const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0);
      
      const { data: notes, error } = await supabase
        .from('daily_notes')
        .select('date, is_leave, activity')
        .eq('mobile_number', mobileNumber)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0])
        .order('date', { ascending: true });

      if (error) throw error;

      // Create a map of notes by date for easy lookup
      const notesMap = new Map();
      (notes || []).forEach(note => {
        notesMap.set(note.date, note);
      });

      // Generate all dates in the month to check for gaps
      const allDates = [];
      const currentDate = new Date(startOfMonth);
      const today = new Date();
      
      while (currentDate <= endOfMonth && currentDate <= today) {
        allDates.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      // Sort dates in descending order to start from most recent
      allDates.reverse();

      let consecutiveLeaveDays = 0;
      let lastActivityDate = null;
      
      // Count consecutive leave days from most recent date
      for (const dateStr of allDates) {
        const note = notesMap.get(dateStr);
        
        // If no note exists for this date, or note is marked as leave, or no activity
        const isLeaveDay = !note || note.is_leave || !note.activity || note.activity.trim() === '';
        
        if (isLeaveDay) {
          consecutiveLeaveDays++;
        } else {
          // Found an active day, stop counting consecutive leave days
          if (!lastActivityDate) {
            lastActivityDate = dateStr;
          }
          break;
        }
        
        // Track last activity date regardless of consecutive streak
        if (note && !note.is_leave && note.activity && note.activity.trim() !== '' && !lastActivityDate) {
          lastActivityDate = dateStr;
        }
      }

      // If we didn't find last activity in consecutive check, search all notes
      if (!lastActivityDate) {
        // Sort all dates in descending order to find most recent activity
        const sortedDates = allDates.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
        for (const dateStr of sortedDates) {
          const note = notesMap.get(dateStr);
          if (note && !note.is_leave && note.activity && note.activity.trim() !== '') {
            lastActivityDate = dateStr;
            break;
          }
        }
      }

      const isInactive = consecutiveLeaveDays >= 3;

      return {
        consecutive_leave_days: consecutiveLeaveDays,
        is_inactive: isInactive,
        last_activity_date: lastActivityDate,
        total_notes: notes?.length || 0
      };

    } catch (error) {
      console.error(`Error analyzing performance for ${agentName}:`, error);
      return {
        consecutive_leave_days: 0,
        is_inactive: false,
        last_activity_date: null,
        total_notes: 0
      };
    }
  };

  const getStatusBadge = (agent: AgentPerformance) => {
    if (agent.is_inactive) {
      return <Badge variant="destructive" className="flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        Inactive
      </Badge>;
    }
    return <Badge variant="default" className="flex items-center gap-1">
      <Activity className="h-3 w-3" />
      Active
    </Badge>;
  };

  const generateMonthOptions = () => {
    const options = [];
    const currentDate = new Date();
    
    // Add current and past 11 months (total 12 months)
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
      const monthValue = date.toISOString().slice(0, 7);
      const monthLabel = date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
      options.push({ value: monthValue, label: monthLabel });
    }
    
    return options;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-5 w-5" />
          Panchayath Performance Report
        </CardTitle>
        <CardDescription>
          Monitor agent activity and identify inactive agents based on daily notes
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Panchayath and Month Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Panchayath</label>
            <Select value={selectedPanchayath} onValueChange={setSelectedPanchayath}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a panchayath" />
              </SelectTrigger>
              <SelectContent>
                {panchayaths.map((panchayath) => (
                  <SelectItem key={panchayath.id} value={panchayath.id}>
                    {panchayath.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            <label className="text-sm font-medium">Select Month</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a month" />
              </SelectTrigger>
              <SelectContent>
                {generateMonthOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Performance Statistics */}
        {selectedPanchayath && selectedMonth && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-sm font-medium">Total Agents</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{performanceStats.total_agents}</div>
                <p className="text-xs text-muted-foreground">All agent types</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <CardTitle className="text-sm font-medium">Inactive Agents</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{performanceStats.inactive_agents}</div>
                <p className="text-xs text-muted-foreground">3+ consecutive leave days</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <TrendingDown className="h-4 w-4 text-destructive" />
                  <CardTitle className="text-sm font-medium">Inactive Percentage</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">{performanceStats.inactive_percentage}%</div>
                <p className="text-xs text-muted-foreground">Performance metric</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Agent Performance by Role */}
        {selectedPanchayath && selectedMonth && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Agent Performance Details</h3>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading performance data...</p>
              </div>
            ) : agentPerformance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No agents found for this panchayath
              </div>
            ) : (
              <div className="space-y-4">
                {/* Group agents by role */}
                {['coordinator', 'supervisor', 'group_leader', 'pro'].map((roleType) => {
                  const roleAgents = agentPerformance.filter(agent => agent.agent_type === roleType);
                  if (roleAgents.length === 0) return null;
                  
                  const roleDisplayName = roleType === 'group_leader' ? 'Group Leader' : 
                                         roleType === 'pro' ? 'PRO' : 
                                         roleType.charAt(0).toUpperCase() + roleType.slice(1);
                  
                  return (
                    <Collapsible key={roleType}>
                      <Card>
                        <CollapsibleTrigger asChild>
                          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <CardTitle className="text-lg">{roleDisplayName}s</CardTitle>
                                <Badge variant="secondary">{roleAgents.length} agents</Badge>
                                <Badge variant={roleAgents.some(a => a.is_inactive) ? "destructive" : "default"}>
                                  {roleAgents.filter(a => a.is_inactive).length} inactive
                                </Badge>
                              </div>
                              <ChevronDown className="h-4 w-4 transition-transform duration-200 data-[state=open]:rotate-180" />
                            </div>
                          </CardHeader>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <CardContent className="pt-0">
                            <div className="rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Agent Name</TableHead>
                                    <TableHead>Mobile</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Consecutive Leave Days</TableHead>
                                    <TableHead>Last Activity</TableHead>
                                    <TableHead>Total Notes</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {roleAgents.map((agent) => (
                                    <TableRow key={agent.agent_id}>
                                      <TableCell className="font-medium">{agent.agent_name}</TableCell>
                                      <TableCell>{agent.mobile_number}</TableCell>
                                      <TableCell>{getStatusBadge(agent)}</TableCell>
                                      <TableCell>
                                        <span className={agent.consecutive_leave_days >= 3 ? "text-destructive font-semibold" : ""}>
                                          {agent.consecutive_leave_days}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        {agent.last_activity_date 
                                          ? new Date(agent.last_activity_date).toLocaleDateString()
                                          : "No activity"
                                        }
                                      </TableCell>
                                      <TableCell>{agent.total_notes}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </CardContent>
                        </CollapsibleContent>
                      </Card>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};